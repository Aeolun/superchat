// ABOUTME: Bit-level stream operations for encoding and decoding binary data
// ABOUTME: Supports MSB-first and LSB-first bit ordering with byte-aligned operations

use crate::{BinSchemaError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Endianness {
    BigEndian,
    LittleEndian,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BitOrder {
    MsbFirst,
    LsbFirst,
}

/// Encoder for writing bit-level data to a byte stream
pub struct BitStreamEncoder {
    buffer: Vec<u8>,
    current_byte: u8,
    bit_position: u8,
    bit_order: BitOrder,
}

impl BitStreamEncoder {
    pub fn new(bit_order: BitOrder) -> Self {
        Self {
            buffer: Vec::new(),
            current_byte: 0,
            bit_position: 0,
            bit_order,
        }
    }

    pub fn write_bits(&mut self, value: u64, num_bits: u8) {
        if num_bits == 0 || num_bits > 64 {
            return;
        }

        let mask = if num_bits == 64 { u64::MAX } else { (1u64 << num_bits) - 1 };
        let value = value & mask;

        for i in 0..num_bits {
            let bit_index = match self.bit_order {
                BitOrder::MsbFirst => num_bits - 1 - i,
                BitOrder::LsbFirst => i,
            };
            let bit = ((value >> bit_index) & 1) as u8;

            self.write_single_bit(bit);
        }
    }

    fn write_single_bit(&mut self, bit: u8) {
        let bit_index = match self.bit_order {
            BitOrder::MsbFirst => 7 - self.bit_position,
            BitOrder::LsbFirst => self.bit_position,
        };

        if bit != 0 {
            self.current_byte |= 1 << bit_index;
        }

        self.bit_position += 1;

        if self.bit_position == 8 {
            self.flush_byte();
        }
    }

    fn flush_byte(&mut self) {
        self.buffer.push(self.current_byte);
        self.current_byte = 0;
        self.bit_position = 0;
    }

    pub fn write_uint8(&mut self, value: u8) {
        self.write_bits(value as u64, 8);
    }

    pub fn write_uint16(&mut self, value: u16, endianness: Endianness) {
        match endianness {
            Endianness::BigEndian => {
                self.write_uint8((value >> 8) as u8);
                self.write_uint8(value as u8);
            }
            Endianness::LittleEndian => {
                self.write_uint8(value as u8);
                self.write_uint8((value >> 8) as u8);
            }
        }
    }

    pub fn write_uint32(&mut self, value: u32, endianness: Endianness) {
        match endianness {
            Endianness::BigEndian => {
                self.write_uint8((value >> 24) as u8);
                self.write_uint8((value >> 16) as u8);
                self.write_uint8((value >> 8) as u8);
                self.write_uint8(value as u8);
            }
            Endianness::LittleEndian => {
                self.write_uint8(value as u8);
                self.write_uint8((value >> 8) as u8);
                self.write_uint8((value >> 16) as u8);
                self.write_uint8((value >> 24) as u8);
            }
        }
    }

    pub fn write_uint64(&mut self, value: u64, endianness: Endianness) {
        match endianness {
            Endianness::BigEndian => {
                self.write_uint32((value >> 32) as u32, endianness);
                self.write_uint32(value as u32, endianness);
            }
            Endianness::LittleEndian => {
                self.write_uint32(value as u32, endianness);
                self.write_uint32((value >> 32) as u32, endianness);
            }
        }
    }

    pub fn write_int8(&mut self, value: i8) {
        self.write_uint8(value as u8);
    }

    pub fn write_int16(&mut self, value: i16, endianness: Endianness) {
        self.write_uint16(value as u16, endianness);
    }

    pub fn write_int32(&mut self, value: i32, endianness: Endianness) {
        self.write_uint32(value as u32, endianness);
    }

    pub fn write_int64(&mut self, value: i64, endianness: Endianness) {
        self.write_uint64(value as u64, endianness);
    }

    pub fn write_float32(&mut self, value: f32, endianness: Endianness) {
        self.write_uint32(value.to_bits(), endianness);
    }

    pub fn write_float64(&mut self, value: f64, endianness: Endianness) {
        self.write_uint64(value.to_bits(), endianness);
    }

    pub fn finish(mut self) -> Vec<u8> {
        if self.bit_position > 0 {
            self.flush_byte();
        }
        self.buffer
    }
}

/// Decoder for reading bit-level data from a byte stream
pub struct BitStreamDecoder {
    bytes: Vec<u8>,
    byte_offset: usize,
    bit_offset: u8,
    bit_order: BitOrder,
}

impl BitStreamDecoder {
    pub fn new(bytes: Vec<u8>, bit_order: BitOrder) -> Self {
        Self {
            bytes,
            byte_offset: 0,
            bit_offset: 0,
            bit_order,
        }
    }

    pub fn read_bits(&mut self, num_bits: u8) -> Result<u64> {
        if num_bits == 0 || num_bits > 64 {
            return Err(BinSchemaError::InvalidValue("Invalid number of bits".to_string()));
        }

        let mut result = 0u64;

        for i in 0..num_bits {
            let bit = self.read_single_bit()?;
            let bit_index = match self.bit_order {
                BitOrder::MsbFirst => num_bits - 1 - i,
                BitOrder::LsbFirst => i,
            };
            result |= (bit as u64) << bit_index;
        }

        Ok(result)
    }

    fn read_single_bit(&mut self) -> Result<u8> {
        if self.byte_offset >= self.bytes.len() {
            return Err(BinSchemaError::UnexpectedEof);
        }

        let bit_index = match self.bit_order {
            BitOrder::MsbFirst => 7 - self.bit_offset,
            BitOrder::LsbFirst => self.bit_offset,
        };

        let bit = (self.bytes[self.byte_offset] >> bit_index) & 1;

        self.bit_offset += 1;

        if self.bit_offset == 8 {
            self.byte_offset += 1;
            self.bit_offset = 0;
        }

        Ok(bit)
    }

    pub fn read_uint8(&mut self) -> Result<u8> {
        Ok(self.read_bits(8)? as u8)
    }

    pub fn read_uint16(&mut self, endianness: Endianness) -> Result<u16> {
        match endianness {
            Endianness::BigEndian => {
                let high = self.read_uint8()? as u16;
                let low = self.read_uint8()? as u16;
                Ok((high << 8) | low)
            }
            Endianness::LittleEndian => {
                let low = self.read_uint8()? as u16;
                let high = self.read_uint8()? as u16;
                Ok((high << 8) | low)
            }
        }
    }

    pub fn read_uint32(&mut self, endianness: Endianness) -> Result<u32> {
        match endianness {
            Endianness::BigEndian => {
                let b0 = self.read_uint8()? as u32;
                let b1 = self.read_uint8()? as u32;
                let b2 = self.read_uint8()? as u32;
                let b3 = self.read_uint8()? as u32;
                Ok((b0 << 24) | (b1 << 16) | (b2 << 8) | b3)
            }
            Endianness::LittleEndian => {
                let b0 = self.read_uint8()? as u32;
                let b1 = self.read_uint8()? as u32;
                let b2 = self.read_uint8()? as u32;
                let b3 = self.read_uint8()? as u32;
                Ok((b3 << 24) | (b2 << 16) | (b1 << 8) | b0)
            }
        }
    }

    pub fn read_uint64(&mut self, endianness: Endianness) -> Result<u64> {
        match endianness {
            Endianness::BigEndian => {
                let high = self.read_uint32(endianness)? as u64;
                let low = self.read_uint32(endianness)? as u64;
                Ok((high << 32) | low)
            }
            Endianness::LittleEndian => {
                let low = self.read_uint32(endianness)? as u64;
                let high = self.read_uint32(endianness)? as u64;
                Ok((high << 32) | low)
            }
        }
    }

    pub fn read_int8(&mut self) -> Result<i8> {
        Ok(self.read_uint8()? as i8)
    }

    pub fn read_int16(&mut self, endianness: Endianness) -> Result<i16> {
        Ok(self.read_uint16(endianness)? as i16)
    }

    pub fn read_int32(&mut self, endianness: Endianness) -> Result<i32> {
        Ok(self.read_uint32(endianness)? as i32)
    }

    pub fn read_int64(&mut self, endianness: Endianness) -> Result<i64> {
        Ok(self.read_uint64(endianness)? as i64)
    }

    pub fn read_float32(&mut self, endianness: Endianness) -> Result<f32> {
        Ok(f32::from_bits(self.read_uint32(endianness)?))
    }

    pub fn read_float64(&mut self, endianness: Endianness) -> Result<f64> {
        Ok(f64::from_bits(self.read_uint64(endianness)?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uint8_roundtrip() {
        let mut encoder = BitStreamEncoder::new(BitOrder::MsbFirst);
        encoder.write_uint8(42);
        encoder.write_uint8(255);
        encoder.write_uint8(0);

        let bytes = encoder.finish();
        let mut decoder = BitStreamDecoder::new(bytes, BitOrder::MsbFirst);

        assert_eq!(decoder.read_uint8().unwrap(), 42);
        assert_eq!(decoder.read_uint8().unwrap(), 255);
        assert_eq!(decoder.read_uint8().unwrap(), 0);
    }

    #[test]
    fn test_uint16_big_endian() {
        let mut encoder = BitStreamEncoder::new(BitOrder::MsbFirst);
        encoder.write_uint16(0x1234, Endianness::BigEndian);

        let bytes = encoder.finish();
        assert_eq!(bytes, vec![0x12, 0x34]);

        let mut decoder = BitStreamDecoder::new(bytes, BitOrder::MsbFirst);
        assert_eq!(decoder.read_uint16(Endianness::BigEndian).unwrap(), 0x1234);
    }

    #[test]
    fn test_float32_special_values() {
        let mut encoder = BitStreamEncoder::new(BitOrder::MsbFirst);
        encoder.write_float32(f32::INFINITY, Endianness::BigEndian);
        encoder.write_float32(f32::NEG_INFINITY, Endianness::BigEndian);

        let bytes = encoder.finish();
        let mut decoder = BitStreamDecoder::new(bytes, BitOrder::MsbFirst);

        assert_eq!(decoder.read_float32(Endianness::BigEndian).unwrap(), f32::INFINITY);
        assert_eq!(decoder.read_float32(Endianness::BigEndian).unwrap(), f32::NEG_INFINITY);
    }
}
