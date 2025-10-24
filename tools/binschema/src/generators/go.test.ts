import { describe, test, expect } from "bun:test";
import { generateGo } from "./go.js";
import type { BinarySchema } from "../schema/binary-schema.js";

describe("Go Code Generator", () => {
  test("generates code for simple uint8 field", () => {
    const schema: BinarySchema = {
      config: { endianness: "big_endian", bit_order: "msb_first" },
      types: {
        SimpleMessage: {
          sequence: [
            { name: "value", type: "uint8" }
          ]
        }
      }
    };

    const result = generateGo(schema, "SimpleMessage");

    // Should generate struct
    expect(result.code).toContain("type SimpleMessage struct");
    expect(result.code).toContain("Value uint8");

    // Should generate Encode method
    expect(result.code).toContain("func (m *SimpleMessage) Encode() ([]byte, error)");
    expect(result.code).toContain("encoder.WriteUint8(m.Value)");

    // Should generate Decode function
    expect(result.code).toContain("func DecodeSimpleMessage(bytes []byte) (*SimpleMessage, error)");
    expect(result.code).toContain("value, err := decoder.ReadUint8()");
  });

  test("generates code for uint16 with endianness", () => {
    const schema: BinarySchema = {
      config: { endianness: "big_endian" },
      types: {
        Uint16Message: {
          sequence: [
            { name: "value", type: "uint16" }
          ]
        }
      }
    };

    const result = generateGo(schema, "Uint16Message");

    expect(result.code).toContain("Value uint16");
    expect(result.code).toContain("encoder.WriteUint16(m.Value, runtime.BigEndian)");
    expect(result.code).toContain("value, err := decoder.ReadUint16(runtime.BigEndian)");
  });

  test("generates code for little endian uint32", () => {
    const schema: BinarySchema = {
      config: { endianness: "little_endian" },
      types: {
        Uint32Message: {
          sequence: [
            { name: "value", type: "uint32" }
          ]
        }
      }
    };

    const result = generateGo(schema, "Uint32Message");

    expect(result.code).toContain("encoder.WriteUint32(m.Value, runtime.LittleEndian)");
    expect(result.code).toContain("decoder.ReadUint32(runtime.LittleEndian)");
  });

  test("generates code for signed integers", () => {
    const schema: BinarySchema = {
      config: { endianness: "big_endian" },
      types: {
        SignedMessage: {
          sequence: [
            { name: "int8_value", type: "int8" },
            { name: "int16_value", type: "int16" },
            { name: "int32_value", type: "int32" },
            { name: "int64_value", type: "int64" }
          ]
        }
      }
    };

    const result = generateGo(schema, "SignedMessage");

    expect(result.code).toContain("Int8Value int8");
    expect(result.code).toContain("Int16Value int16");
    expect(result.code).toContain("Int32Value int32");
    expect(result.code).toContain("Int64Value int64");

    expect(result.code).toContain("encoder.WriteInt8(m.Int8Value)");
    expect(result.code).toContain("encoder.WriteInt16(m.Int16Value, runtime.BigEndian)");
    expect(result.code).toContain("encoder.WriteInt32(m.Int32Value, runtime.BigEndian)");
    expect(result.code).toContain("encoder.WriteInt64(m.Int64Value, runtime.BigEndian)");
  });

  test("generates code for floating point types", () => {
    const schema: BinarySchema = {
      config: { endianness: "big_endian" },
      types: {
        FloatMessage: {
          sequence: [
            { name: "float32_value", type: "float32" },
            { name: "float64_value", type: "float64" }
          ]
        }
      }
    };

    const result = generateGo(schema, "FloatMessage");

    expect(result.code).toContain("Float32Value float32");
    expect(result.code).toContain("Float64Value float64");

    expect(result.code).toContain("encoder.WriteFloat32(m.Float32Value, runtime.BigEndian)");
    expect(result.code).toContain("encoder.WriteFloat64(m.Float64Value, runtime.BigEndian)");
  });

  test("handles field name conversion (snake_case to PascalCase)", () => {
    const schema: BinarySchema = {
      config: {},
      types: {
        FieldNamesTest: {
          sequence: [
            { name: "simple_field", type: "uint8" },
            { name: "another_long_field_name", type: "uint16" }
          ]
        }
      }
    };

    const result = generateGo(schema, "FieldNamesTest");

    expect(result.code).toContain("SimpleField uint8");
    expect(result.code).toContain("AnotherLongFieldName uint16");
    expect(result.code).toContain("m.SimpleField");
    expect(result.code).toContain("m.AnotherLongFieldName");
  });

  test("generates package and imports correctly", () => {
    const schema: BinarySchema = {
      config: {},
      types: {
        Test: {
          sequence: [{ name: "value", type: "uint8" }]
        }
      }
    };

    const result = generateGo(schema, "Test");

    expect(result.code).toContain("package main");
    expect(result.code).toContain('import (');
    expect(result.code).toContain('"fmt"');
    expect(result.code).toContain('"io"');
    expect(result.code).toContain('"github.com/anthropics/binschema/runtime"');
  });

  test("supports custom package name", () => {
    const schema: BinarySchema = {
      config: {},
      types: {
        Test: {
          sequence: [{ name: "value", type: "uint8" }]
        }
      }
    };

    const result = generateGo(schema, "Test", { packageName: "mypackage" });

    expect(result.code).toContain("package mypackage");
  });

  test("throws error for non-existent type", () => {
    const schema: BinarySchema = {
      config: {},
      types: {
        Test: {
          sequence: [{ name: "value", type: "uint8" }]
        }
      }
    };

    expect(() => generateGo(schema, "NonExistent")).toThrow("Type NonExistent not found");
  });

  test("includes error handling in decode", () => {
    const schema: BinarySchema = {
      config: {},
      types: {
        Test: {
          sequence: [{ name: "value", type: "uint8" }]
        }
      }
    };

    const result = generateGo(schema, "Test");

    expect(result.code).toContain("if err != nil {");
    expect(result.code).toContain('return nil, fmt.Errorf("failed to decode value: %w", err)');
  });

  test("generates all types in schema", () => {
    const schema: BinarySchema = {
      config: {},
      types: {
        TypeA: {
          sequence: [{ name: "value", type: "uint8" }]
        },
        TypeB: {
          sequence: [{ name: "value", type: "uint16" }]
        }
      }
    };

    const result = generateGo(schema, "TypeA");

    // Should generate both types even though we only requested TypeA
    expect(result.code).toContain("type TypeA struct");
    expect(result.code).toContain("type TypeB struct");
    expect(result.code).toContain("func DecodeTypeA(");
    expect(result.code).toContain("func DecodeTypeB(");
  });
});
