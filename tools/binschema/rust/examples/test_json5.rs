use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct TestData {
    name: String,
    values: HashMap<String, f64>,
}

fn main() {
    let json5_str = r#"{
  name: 'float_test',
  values: {
    positive_infinity: Infinity,
    negative_infinity: -Infinity,
    nan_value: NaN,
    normal_float: 3.14159,
    integer: 42
  }
}"#;

    match json5::from_str::<TestData>(json5_str) {
        Ok(data) => {
            println!("✓ Successfully parsed JSON5!");
            println!("Name: {}", data.name);
            println!("\nValues:");
            for (key, value) in &data.values {
                let type_str = if value.is_infinite() {
                    if *value > 0.0 { "Infinity" } else { "-Infinity" }
                } else if value.is_nan() {
                    "NaN"
                } else {
                    "Normal"
                };
                println!("  {}: {} ({})", key, value, type_str);
            }
        }
        Err(e) => {
            println!("✗ Failed to parse JSON5:");
            println!("  Error: {}", e);
        }
    }
}
