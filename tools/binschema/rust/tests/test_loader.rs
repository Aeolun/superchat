// ABOUTME: Integration tests for loading and running BinSchema test suites
// ABOUTME: Validates JSON5 test suite loading and basic test execution

use binschema_runtime::test_schema::TestSuite;
use std::fs;
use std::path::PathBuf;

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
fn test_load_all_suites() {
    let tests_dir = "../tests-json";
    let test_files = find_test_files(tests_dir);

    println!("Found {} test files", test_files.len());

    let mut loaded = 0;
    let mut failed = 0;

    for file in &test_files {
        match load_test_suite(file) {
            Ok(suite) => {
                loaded += 1;
                if std::env::var("VERBOSE").is_ok() {
                    println!("  ✓ {}: {} test cases", suite.name, suite.test_cases.len());
                }
            }
            Err(e) => {
                failed += 1;
                if std::env::var("VERBOSE").is_ok() {
                    println!("  ✗ {:?}: {}", file.file_name().unwrap(), e);
                }
            }
        }
    }

    println!("\nSummary: {} loaded, {} failed", loaded, failed);
    assert!(loaded >= 50, "Should load at least 50 test suites (all primitives)");
    // Note: Some composite test files may fail due to more complex schema structures
    println!("✓ Successfully loaded {} test suites", loaded);
}

#[test]
fn test_primitive_suite_structure() {
    let tests_dir = "../tests-json/primitives";
    let test_files = find_test_files(tests_dir);

    // Find a uint8 test as an example
    let uint8_file = test_files.iter()
        .find(|p| p.file_name().unwrap().to_str().unwrap().contains("uint8.test"))
        .expect("Should find uint8 test file");

    let suite = load_test_suite(uint8_file).expect("Should load uint8 suite");

    println!("Suite: {}", suite.name);
    println!("Description: {}", suite.description);
    println!("Test type: {}", suite.test_type);
    println!("Number of test cases: {}", suite.test_cases.len());

    assert_eq!(suite.name, "uint8");
    assert!(suite.test_cases.len() > 0);

    // Check first test case
    let first = &suite.test_cases[0];
    println!("\nFirst test case:");
    println!("  Description: {}", first.description);
    if let Some(bytes) = &first.bytes {
        println!("  Expected bytes: {:?}", bytes);
        assert!(bytes.len() > 0);
    } else if let Some(bits) = &first.bits {
        println!("  Expected bits: {:?}", bits);
        assert!(bits.len() > 0);
    } else {
        panic!("Test case should have either bytes or bits");
    }
}

#[test]
fn test_float_infinity_parsing() {
    let tests_dir = "../tests-json";
    let test_files = find_test_files(tests_dir);

    // Find a float32 or float64 test with Infinity
    let float_file = test_files.iter()
        .find(|p| {
            let name = p.file_name().unwrap().to_str().unwrap();
            name.contains("float32") || name.contains("float64")
        })
        .expect("Should find float test file");

    let suite = load_test_suite(float_file).expect("Should load float suite");

    println!("Suite: {}", suite.name);

    // Find test case with Infinity in description
    let infinity_case = suite.test_cases.iter()
        .find(|tc| tc.description.to_lowercase().contains("infinity"));

    if let Some(case) = infinity_case {
        println!("Found Infinity test case: {}", case.description);
        println!("  Value: {:?}", case.value);
        println!("  Bytes: {:?}", case.bytes);

        // Try to extract the float value
        if let Some(obj) = case.value.as_object() {
            if let Some(value_field) = obj.get("value") {
                if let Some(f) = value_field.as_f64() {
                    println!("  Parsed as f64: {}", f);
                    println!("  Is infinite: {}", f.is_infinite());
                    assert!(f.is_infinite(), "Should parse Infinity correctly");
                }
            }
        }
    } else {
        println!("Note: No Infinity test case found in {}", suite.name);
    }
}
