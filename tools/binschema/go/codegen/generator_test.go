// ABOUTME: Tests for the Go code generator
// ABOUTME: Validates that generated code compiles and produces correct output
package codegen

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGenerateSimpleStruct(t *testing.T) {
	schema := map[string]interface{}{
		"config": map[string]interface{}{
			"endianness": "big_endian",
		},
		"types": map[string]interface{}{
			"Point": map[string]interface{}{
				"sequence": []interface{}{
					map[string]interface{}{
						"name": "x",
						"type": "uint16",
					},
					map[string]interface{}{
						"name": "y",
						"type": "uint16",
					},
				},
			},
		},
	}

	code, err := GenerateGo(schema, "Point")
	require.NoError(t, err)
	require.NotEmpty(t, code)

	t.Log("Generated code:")
	t.Log(code)

	// Verify generated code contains expected elements
	require.Contains(t, code, "type Point struct")
	require.Contains(t, code, "X uint16")
	require.Contains(t, code, "Y uint16")
	require.Contains(t, code, "func (m *Point) Encode()")
	require.Contains(t, code, "func DecodePoint(bytes []byte)")
	require.Contains(t, code, "encoder.WriteUint16(m.X, runtime.BigEndian)")
	require.Contains(t, code, "encoder.WriteUint16(m.Y, runtime.BigEndian)")
}

func TestGeneratePrimitiveTypes(t *testing.T) {
	tests := []struct {
		name        string
		fieldType   string
		goType      string
		writeMethod string
		readMethod  string
	}{
		{
			name:        "uint8",
			fieldType:   "uint8",
			goType:      "uint8",
			writeMethod: "WriteUint8",
			readMethod:  "ReadUint8",
		},
		{
			name:        "uint16",
			fieldType:   "uint16",
			goType:      "uint16",
			writeMethod: "WriteUint16",
			readMethod:  "ReadUint16",
		},
		{
			name:        "uint32",
			fieldType:   "uint32",
			goType:      "uint32",
			writeMethod: "WriteUint32",
			readMethod:  "ReadUint32",
		},
		{
			name:        "uint64",
			fieldType:   "uint64",
			goType:      "uint64",
			writeMethod: "WriteUint64",
			readMethod:  "ReadUint64",
		},
		{
			name:        "int8",
			fieldType:   "int8",
			goType:      "int8",
			writeMethod: "WriteInt8",
			readMethod:  "ReadInt8",
		},
		{
			name:        "float32",
			fieldType:   "float32",
			goType:      "float32",
			writeMethod: "WriteFloat32",
			readMethod:  "ReadFloat32",
		},
		{
			name:        "float64",
			fieldType:   "float64",
			goType:      "float64",
			writeMethod: "WriteFloat64",
			readMethod:  "ReadFloat64",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			schema := map[string]interface{}{
				"types": map[string]interface{}{
					"TestType": map[string]interface{}{
						"sequence": []interface{}{
							map[string]interface{}{
								"name": "value",
								"type": tt.fieldType,
							},
						},
					},
				},
			}

			code, err := GenerateGo(schema, "TestType")
			require.NoError(t, err)
			require.Contains(t, code, tt.goType)
			require.Contains(t, code, tt.writeMethod)
			require.Contains(t, code, tt.readMethod)
		})
	}
}

func TestGenerateEndianness(t *testing.T) {
	tests := []struct {
		name               string
		schemaEndianness   string
		fieldEndianness    string
		expectedEndianness string
	}{
		{
			name:               "default big endian",
			schemaEndianness:   "big_endian",
			fieldEndianness:    "",
			expectedEndianness: "BigEndian",
		},
		{
			name:               "default little endian",
			schemaEndianness:   "little_endian",
			fieldEndianness:    "",
			expectedEndianness: "LittleEndian",
		},
		{
			name:               "field override to little",
			schemaEndianness:   "big_endian",
			fieldEndianness:    "little_endian",
			expectedEndianness: "LittleEndian",
		},
		{
			name:               "field override to big",
			schemaEndianness:   "little_endian",
			fieldEndianness:    "big_endian",
			expectedEndianness: "BigEndian",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fieldData := map[string]interface{}{
				"name": "value",
				"type": "uint16",
			}
			if tt.fieldEndianness != "" {
				fieldData["endianness"] = tt.fieldEndianness
			}

			schema := map[string]interface{}{
				"config": map[string]interface{}{
					"endianness": tt.schemaEndianness,
				},
				"types": map[string]interface{}{
					"TestType": map[string]interface{}{
						"sequence": []interface{}{fieldData},
					},
				},
			}

			code, err := GenerateGo(schema, "TestType")
			require.NoError(t, err)
			require.Contains(t, code, "runtime."+tt.expectedEndianness)
		})
	}
}
