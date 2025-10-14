// ABOUTME: Test schema types for loading JSON5 test suites
// ABOUTME: Mirrors TypeScript test schema structure for cross-language compatibility

use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize, Clone)]
pub struct TestSuite {
    pub name: String,
    pub description: String,
    pub schema: Schema,
    pub test_type: String,
    pub test_cases: Vec<TestCase>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Schema {
    #[serde(default)]
    pub config: Option<SchemaConfig>,
    pub types: HashMap<String, TypeDef>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SchemaConfig {
    #[serde(default)]
    pub endianness: Option<String>,
    #[serde(default)]
    pub bit_order: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum TypeDef {
    Sequence { sequence: Vec<Field> },
    Direct {
        #[serde(rename = "type")]
        type_name: String,
        #[serde(default)]
        kind: Option<String>,
        #[serde(default)]
        encoding: Option<String>,
        #[serde(default)]
        length_type: Option<String>,
        #[serde(default)]
        description: Option<String>,
    },
}

#[derive(Debug, Deserialize, Clone)]
pub struct Field {
    #[serde(default)]
    pub name: Option<String>,  // Optional because array items don't have names
    #[serde(rename = "type")]
    pub field_type: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub length: Option<serde_json::Value>,
    #[serde(default)]
    pub length_type: Option<String>,
    #[serde(default)]
    pub items: Option<Box<Field>>,
    #[serde(default)]
    pub encoding: Option<String>,
    #[serde(default)]
    pub conditional: Option<String>,
    #[serde(default)]
    pub endianness: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TestCase {
    pub description: String,
    pub value: serde_json::Value,
    #[serde(default)]
    pub bytes: Option<Vec<u8>>,  // Optional - some tests only validate bits
    #[serde(default)]
    pub bits: Option<Vec<u8>>,
    #[serde(default)]
    pub error: Option<String>,
}
