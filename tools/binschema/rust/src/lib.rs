// ABOUTME: Rust runtime for BinSchema bit-level serialization
// ABOUTME: Provides BitStreamEncoder and BitStreamDecoder for byte-compatible encoding/decoding

pub mod bitstream;
pub mod test_schema;
pub mod codegen;

pub use bitstream::{BitStreamEncoder, BitStreamDecoder, Endianness, BitOrder};

#[derive(Debug, Clone, PartialEq)]
pub enum BinSchemaError {
    UnexpectedEof,
    InvalidUtf8,
    InvalidValue(String),
}

impl std::fmt::Display for BinSchemaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BinSchemaError::UnexpectedEof => write!(f, "Unexpected end of input"),
            BinSchemaError::InvalidUtf8 => write!(f, "Invalid UTF-8 data"),
            BinSchemaError::InvalidValue(msg) => write!(f, "Invalid value: {}", msg),
        }
    }
}

impl std::error::Error for BinSchemaError {}

pub type Result<T> = std::result::Result<T, BinSchemaError>;
