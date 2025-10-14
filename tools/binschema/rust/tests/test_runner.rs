// ABOUTME: Test runner for BinSchema Rust code generation
// ABOUTME: Compiles all test suites at once for fast execution

use binschema_runtime::codegen::generate_code_for_test_suite;
use binschema_runtime::test_schema::TestSuite;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn find_test_files(dir: &str) -> Vec<PathBuf> {
    let mut files = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files.extend(find_test_files(path.to_str().unwrap()));
            } else if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if path.file_name()
                    .and_then(|s| s.to_str())
                    .map(|s| s.contains(".test."))
                    .unwrap_or(false)
                {
                    files.push(path);
                }
            }
        }
    }

    files
}

fn load_test_suite(path: &PathBuf) -> Result<TestSuite, Box<dyn std::error::Error>> {
    let content = fs::read_to_string(path)?;
    let suite: TestSuite = json5::from_str(&content)?;
    Ok(suite)
}

#[test]
fn test_run_primitive_suites() {
    let tests_dir = "../tests-json/primitives";
    let test_files = find_test_files(tests_dir);

    println!("Found {} primitive test files", test_files.len());

    // Load all test suites
    let mut suites = Vec::new();
    for file in &test_files {
        match load_test_suite(file) {
            Ok(suite) => suites.push(suite),
            Err(e) => {
                if std::env::var("VERBOSE").is_ok() {
                    println!("  ✗ {:?}: failed to load: {}", file.file_name().unwrap(), e);
                }
            }
        }
    }

    println!("Loaded {} test suites", suites.len());

    // Generate code for all suites at once
    let mut all_modules = Vec::new();
    let mut suite_names = Vec::new();

    for suite in &suites {
        match generate_code_for_test_suite(suite) {
            Ok(code) => {
                // Wrap each suite's code in a public module to avoid name conflicts
                let module_name = suite.name.replace("-", "_");
                all_modules.push(format!("pub mod {} {{\n{}\n}}", module_name, code));
                suite_names.push((module_name, suite.clone()));
            }
            Err(e) => {
                if std::env::var("VERBOSE").is_ok() {
                    println!("  ✗ {}: code generation failed: {}", suite.name, e);
                }
            }
        }
    }

    println!("Generated code for {} suites", all_modules.len());

    // Compile and run all tests at once
    match run_all_tests(&suite_names, &all_modules) {
        Ok(results) => {
            let total_passed: usize = results.iter().map(|(p, _)| p).sum();
            let total_tests: usize = results.iter().map(|(p, f)| p + f).sum();

            if std::env::var("VERBOSE").is_ok() {
                for (i, (passed, failed)) in results.iter().enumerate() {
                    let status = if *failed == 0 { "✓" } else { "✗" };
                    println!("  {} {}: {}/{} passed", status, suite_names[i].0, passed, passed + failed);
                }
            }

            println!("\nSummary: {}/{} tests passed across {} suites",
                total_passed, total_tests, results.len());
        }
        Err(e) => {
            println!("Test execution failed: {}", e);
        }
    }
}

fn run_all_tests(
    suites: &[(String, TestSuite)],
    modules: &[String],
) -> Result<Vec<(usize, usize)>, Box<dyn std::error::Error>> {
    // Create temporary directory
    let tmp_dir = tempfile::tempdir()?;
    let tmp_path = tmp_dir.path();

    // Create a minimal Cargo.toml
    let cargo_toml = format!(r#"
[package]
name = "test_suite"
version = "0.1.0"
edition = "2021"

[dependencies]
binschema-runtime = {{ path = "{}" }}
serde = {{ version = "1.0", features = ["derive"] }}
serde_json = "1.0"
"#, std::env::current_dir()?.display());

    fs::write(tmp_path.join("Cargo.toml"), cargo_toml)?;

    // Create src directory
    fs::create_dir(tmp_path.join("src"))?;

    // Write all generated code modules to lib.rs
    let lib_code = modules.join("\n\n");
    fs::write(tmp_path.join("src").join("lib.rs"), lib_code)?;

    // Generate unified test harness
    let test_harness = generate_unified_test_harness(suites);
    fs::write(tmp_path.join("src").join("main.rs"), test_harness)?;

    // Compile and run (only compile once!)
    let output = Command::new("cargo")
        .args(&["run", "--quiet"])
        .current_dir(tmp_path)
        .output()?;

    if !output.status.success() {
        return Err(format!("Compilation/execution failed: {}",
            String::from_utf8_lossy(&output.stderr)).into());
    }

    // Parse results
    let results_json = String::from_utf8(output.stdout)?;
    let all_results: Vec<Vec<TestResult>> = serde_json::from_str(&results_json)?;

    // Count passed/failed for each suite
    let summary: Vec<(usize, usize)> = all_results
        .iter()
        .map(|suite_results| {
            let passed = suite_results.iter().filter(|r| r.pass).count();
            let failed = suite_results.len() - passed;
            (passed, failed)
        })
        .collect();

    Ok(summary)
}

#[derive(serde::Deserialize)]
struct TestResult {
    #[allow(dead_code)]
    description: String,
    pass: bool,
    #[allow(dead_code)]
    error: Option<String>,
}

fn generate_unified_test_harness(suites: &[(String, TestSuite)]) -> String {
    // No wildcard imports - use fully qualified paths to avoid conflicts
    let mut harness = String::from(r#"
#[derive(serde::Serialize)]
struct TestResult {
    description: String,
    pass: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn main() {
    let mut all_results: Vec<Vec<TestResult>> = Vec::new();

"#);

    for (module_name, suite) in suites {
        harness.push_str(&format!("    // Test suite: {}\n", suite.name));
        harness.push_str("    {\n");
        harness.push_str("        let mut results = Vec::new();\n\n");

        for (i, test_case) in suite.test_cases.iter().enumerate() {
            harness.push_str(&format!("        // Test case {}: {}\n", i, test_case.description));
            harness.push_str("        results.push((|| -> TestResult {\n");
            harness.push_str(&format!("            let description = {:?}.to_string();\n", test_case.description));

            // Generate value construction with module prefix
            harness.push_str(&generate_value_construction(module_name, &suite.test_type, &test_case.value));

            // Encode
            harness.push_str("            let encoded = match value.encode() {\n");
            harness.push_str("                Ok(bytes) => bytes,\n");
            harness.push_str("                Err(e) => return TestResult {\n");
            harness.push_str("                    description,\n");
            harness.push_str("                    pass: false,\n");
            harness.push_str("                    error: Some(format!(\"encode error: {:?}\", e)),\n");
            harness.push_str("                },\n");
            harness.push_str("            };\n\n");

            // Compare bytes
            if let Some(expected_bytes) = &test_case.bytes {
                harness.push_str(&format!("            let expected: Vec<u8> = vec!{:?};\n", expected_bytes));
                harness.push_str("            if encoded != expected {\n");
                harness.push_str("                return TestResult {\n");
                harness.push_str("                    description,\n");
                harness.push_str("                    pass: false,\n");
                harness.push_str("                    error: Some(format!(\"bytes mismatch: got {:?}, want {:?}\", encoded, expected)),\n");
                harness.push_str("                };\n");
                harness.push_str("            }\n\n");
            }

            // Decode
            harness.push_str(&format!("            let decoded = match test_suite::{}::{}::decode(&encoded) {{\n",
                module_name, suite.test_type));
            harness.push_str("                Ok(v) => v,\n");
            harness.push_str("                Err(e) => return TestResult {\n");
            harness.push_str("                    description,\n");
            harness.push_str("                    pass: false,\n");
            harness.push_str("                    error: Some(format!(\"decode error: {:?}\", e)),\n");
            harness.push_str("                },\n");
            harness.push_str("            };\n\n");

            // Compare values
            harness.push_str("            if decoded != value {\n");
            harness.push_str("                return TestResult {\n");
            harness.push_str("                    description,\n");
            harness.push_str("                    pass: false,\n");
            harness.push_str("                    error: Some(format!(\"value mismatch: got {:?}, want {:?}\", decoded, value)),\n");
            harness.push_str("                };\n");
            harness.push_str("            }\n\n");

            harness.push_str("            TestResult { description, pass: true, error: None }\n");
            harness.push_str("        })());\n\n");
        }

        harness.push_str("        all_results.push(results);\n");
        harness.push_str("    }\n\n");
    }

    harness.push_str(r#"
    // Output results as JSON
    let json = serde_json::to_string(&all_results).unwrap();
    println!("{}", json);
}
"#);

    harness
}

fn generate_value_construction(module_name: &str, type_name: &str, value: &serde_json::Value) -> String {
    let obj = match value.as_object() {
        Some(o) => o,
        None => return format!("            let value = test_suite::{}::{}::default();\n", module_name, type_name),
    };

    let mut result = format!("            let value = test_suite::{}::{} {{\n", module_name, type_name);

    for (key, val) in obj {
        result.push_str(&format!("                {}: {} as _,\n", key, format_value(val)));
    }

    result.push_str("            };\n");
    result
}

fn format_value(val: &serde_json::Value) -> String {
    match val {
        serde_json::Value::Number(n) => {
            // Always try as f64 first to handle all numeric types uniformly
            if let Some(f) = n.as_f64() {
                if f.is_infinite() && f.is_sign_positive() {
                    "f64::INFINITY".to_string()
                } else if f.is_infinite() && f.is_sign_negative() {
                    "f64::NEG_INFINITY".to_string()
                } else if f.is_nan() {
                    "f64::NAN".to_string()
                } else if f.fract() == 0.0 && f.abs() < (i64::MAX as f64) {
                    let int_val = f as i64;
                    // Whole number - add i64 suffix for large values to avoid overflow
                    if int_val > i32::MAX as i64 || int_val < i32::MIN as i64 {
                        format!("{}i64", int_val)
                    } else {
                        format!("{}", int_val)
                    }
                } else {
                    // Has decimal part or too large for i64
                    format!("{}", f)
                }
            } else {
                "0".to_string()
            }
        }
        serde_json::Value::String(s) => {
            // Handle bigint notation (e.g., "9223372036854775807n")
            if s.ends_with('n') {
                let num_str = &s[..s.len()-1];
                // Try parsing as i64 first, if that fails use u64
                if num_str.parse::<i64>().is_ok() {
                    format!("{}i64", num_str)
                } else {
                    format!("{}u64", num_str)
                }
            } else {
                format!("{:?}", s)
            }
        }
        serde_json::Value::Bool(b) => format!("{}", b),
        serde_json::Value::Null => "f64::NAN".to_string(), // null in JSON represents NaN for floats
        _ => "todo!()".to_string(),
    }
}
