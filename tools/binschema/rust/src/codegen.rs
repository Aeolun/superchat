// ABOUTME: Rust code generator for BinSchema
// ABOUTME: Generates Rust structs with encode/decode methods from schema definitions

use crate::test_schema::{Field, Schema, TestSuite, TypeDef};

pub struct CodeGenerator {
    schema: Schema,
}

impl CodeGenerator {
    pub fn new(schema: Schema) -> Self {
        Self { schema }
    }

    pub fn generate(&self, type_name: &str) -> Result<String, String> {
        let type_def = self.schema.types.get(type_name)
            .ok_or_else(|| format!("Type {} not found in schema", type_name))?;

        let mut code = String::new();

        // Add necessary imports
        code.push_str("use binschema_runtime::{BitStreamEncoder, BitStreamDecoder, Endianness, BitOrder, Result};\n\n");

        // Generate struct definition
        code.push_str(&self.generate_struct(type_name, type_def)?);
        code.push_str("\n\n");

        // Generate encode implementation
        code.push_str(&self.generate_encode(type_name, type_def)?);
        code.push_str("\n\n");

        // Generate decode implementation
        code.push_str(&self.generate_decode(type_name, type_def)?);

        Ok(code)
    }

    fn generate_struct(&self, name: &str, type_def: &TypeDef) -> Result<String, String> {
        let fields = match type_def {
            TypeDef::Sequence { sequence } => sequence,
            TypeDef::Direct { .. } => return Err("Direct types don't generate structs".to_string()),
        };

        let mut code = format!("#[derive(Debug, Clone, PartialEq)]\npub struct {} {{\n", name);

        for field in fields {
            let field_name = field.name.as_ref()
                .ok_or_else(|| "Field missing name".to_string())?;
            let rust_type = self.map_type_to_rust(field)?;
            code.push_str(&format!("    pub {}: {},\n", field_name, rust_type));
        }

        code.push_str("}");
        Ok(code)
    }

    fn generate_encode(&self, name: &str, type_def: &TypeDef) -> Result<String, String> {
        let fields = match type_def {
            TypeDef::Sequence { sequence } => sequence,
            TypeDef::Direct { .. } => return Err("Direct types don't have encode".to_string()),
        };

        let default_endianness = self.get_default_endianness();

        let mut code = format!("impl {} {{\n", name);
        code.push_str("    pub fn encode(&self) -> Result<Vec<u8>> {\n");
        code.push_str("        let mut encoder = BitStreamEncoder::new(BitOrder::MsbFirst);\n\n");

        for field in fields {
            code.push_str(&self.generate_encode_field(field, &default_endianness, "        ")?);
        }

        code.push_str("\n        Ok(encoder.finish())\n");
        code.push_str("    }\n");
        code.push_str("}");

        Ok(code)
    }

    fn generate_decode(&self, name: &str, type_def: &TypeDef) -> Result<String, String> {
        let fields = match type_def {
            TypeDef::Sequence { sequence } => sequence,
            TypeDef::Direct { .. } => return Err("Direct types don't have decode".to_string()),
        };

        let default_endianness = self.get_default_endianness();

        let mut code = format!("impl {} {{\n", name);
        code.push_str(&format!("    pub fn decode(bytes: &[u8]) -> Result<Self> {{\n"));
        code.push_str("        let mut decoder = BitStreamDecoder::new(bytes.to_vec(), BitOrder::MsbFirst);\n\n");

        for field in fields {
            code.push_str(&self.generate_decode_field(field, &default_endianness, "        ")?);
        }

        code.push_str("\n        Ok(Self {\n");
        for field in fields {
            let field_name = field.name.as_ref()
                .ok_or_else(|| "Field missing name".to_string())?;
            code.push_str(&format!("            {},\n", field_name));
        }
        code.push_str("        })\n");
        code.push_str("    }\n");
        code.push_str("}");

        Ok(code)
    }

    fn generate_encode_field(&self, field: &Field, default_endianness: &str, indent: &str) -> Result<String, String> {
        let field_name = field.name.as_ref()
            .ok_or_else(|| "Field missing name".to_string())?;

        let endianness = field.endianness.as_deref().unwrap_or(default_endianness);
        let rust_endianness = if endianness == "little_endian" { "LittleEndian" } else { "BigEndian" };

        let code = match field.field_type.as_str() {
            "uint8" => format!("{}encoder.write_uint8(self.{});\n", indent, field_name),
            "uint16" => format!("{}encoder.write_uint16(self.{}, Endianness::{});\n", indent, field_name, rust_endianness),
            "uint32" => format!("{}encoder.write_uint32(self.{}, Endianness::{});\n", indent, field_name, rust_endianness),
            "uint64" => format!("{}encoder.write_uint64(self.{}, Endianness::{});\n", indent, field_name, rust_endianness),
            "int8" => format!("{}encoder.write_int8(self.{});\n", indent, field_name),
            "int16" => format!("{}encoder.write_int16(self.{}, Endianness::{});\n", indent, field_name, rust_endianness),
            "int32" => format!("{}encoder.write_int32(self.{}, Endianness::{});\n", indent, field_name, rust_endianness),
            "int64" => format!("{}encoder.write_int64(self.{}, Endianness::{});\n", indent, field_name, rust_endianness),
            "float32" => format!("{}encoder.write_float32(self.{}, Endianness::{});\n", indent, field_name, rust_endianness),
            "float64" => format!("{}encoder.write_float64(self.{}, Endianness::{});\n", indent, field_name, rust_endianness),
            _ => return Err(format!("Unsupported type for encoding: {}", field.field_type)),
        };

        Ok(code)
    }

    fn generate_decode_field(&self, field: &Field, default_endianness: &str, indent: &str) -> Result<String, String> {
        let field_name = field.name.as_ref()
            .ok_or_else(|| "Field missing name".to_string())?;

        let endianness = field.endianness.as_deref().unwrap_or(default_endianness);
        let rust_endianness = if endianness == "little_endian" { "LittleEndian" } else { "BigEndian" };

        let code = match field.field_type.as_str() {
            "uint8" => format!("{}let {} = decoder.read_uint8()?;\n", indent, field_name),
            "uint16" => format!("{}let {} = decoder.read_uint16(Endianness::{})?;\n", indent, field_name, rust_endianness),
            "uint32" => format!("{}let {} = decoder.read_uint32(Endianness::{})?;\n", indent, field_name, rust_endianness),
            "uint64" => format!("{}let {} = decoder.read_uint64(Endianness::{})?;\n", indent, field_name, rust_endianness),
            "int8" => format!("{}let {} = decoder.read_int8()?;\n", indent, field_name),
            "int16" => format!("{}let {} = decoder.read_int16(Endianness::{})?;\n", indent, field_name, rust_endianness),
            "int32" => format!("{}let {} = decoder.read_int32(Endianness::{})?;\n", indent, field_name, rust_endianness),
            "int64" => format!("{}let {} = decoder.read_int64(Endianness::{})?;\n", indent, field_name, rust_endianness),
            "float32" => format!("{}let {} = decoder.read_float32(Endianness::{})?;\n", indent, field_name, rust_endianness),
            "float64" => format!("{}let {} = decoder.read_float64(Endianness::{})?;\n", indent, field_name, rust_endianness),
            _ => return Err(format!("Unsupported type for decoding: {}", field.field_type)),
        };

        Ok(code)
    }

    fn map_type_to_rust(&self, field: &Field) -> Result<String, String> {
        let rust_type = match field.field_type.as_str() {
            "uint8" => "u8",
            "uint16" => "u16",
            "uint32" => "u32",
            "uint64" => "u64",
            "int8" => "i8",
            "int16" => "i16",
            "int32" => "i32",
            "int64" => "i64",
            "float32" => "f32",
            "float64" => "f64",
            _ => return Err(format!("Unsupported type: {}", field.field_type)),
        };

        Ok(rust_type.to_string())
    }

    fn get_default_endianness(&self) -> String {
        self.schema.config.as_ref()
            .and_then(|c| c.endianness.clone())
            .unwrap_or_else(|| "big_endian".to_string())
    }
}

pub fn generate_code_for_test_suite(suite: &TestSuite) -> Result<String, String> {
    let generator = CodeGenerator::new(suite.schema.clone());
    generator.generate(&suite.test_type)
}
