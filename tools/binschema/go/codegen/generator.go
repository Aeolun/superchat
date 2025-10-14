// ABOUTME: Generates Go encoder/decoder code from BinSchema definitions
// ABOUTME: Produces byte-for-byte compatible code with TypeScript implementation
package codegen

import (
	"bytes"
	"fmt"
	"strings"
	"text/template"
)

// Schema represents a BinSchema definition
type Schema struct {
	Config *SchemaConfig          `json:"config"`
	Types  map[string]*TypeDef    `json:"types"`
}

// SchemaConfig contains schema-level configuration
type SchemaConfig struct {
	Endianness string `json:"endianness"` // "big_endian" or "little_endian"
	BitOrder   string `json:"bit_order"`  // "msb_first" or "lsb_first"
}

// TypeDef represents a type definition
type TypeDef struct {
	Sequence []Field `json:"sequence"`
}

// Field represents a field in a struct
type Field struct {
	Name           string                 `json:"name"`
	Type           string                 `json:"type"`
	Kind           string                 `json:"kind,omitempty"`            // For arrays/strings: "fixed", "length_prefixed", "null_terminated", "length_prefixed_items"
	Length         interface{}            `json:"length,omitempty"`          // For fixed arrays: int or string (field reference)
	LengthType     string                 `json:"length_type,omitempty"`     // For length_prefixed: "uint8", "uint16", etc.
	ItemLengthType string                 `json:"item_length_type,omitempty"` // For length_prefixed_items: per-item length type
	Items          *Field                 `json:"items,omitempty"`           // For arrays: item type
	Encoding       string                 `json:"encoding,omitempty"`        // For strings: "utf8", "ascii"
	Optional       bool                   `json:"optional,omitempty"`
	Conditional    string                 `json:"conditional,omitempty"` // Conditional expression (e.g., "present == 1")
	Endianness     string                 `json:"endianness,omitempty"`  // Per-field endianness override
	Fields         []Field                `json:"fields,omitempty"`      // For inline structs
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
}


// GenerateGo generates Go code from a BinSchema definition
// Always generates all types in the schema for simplicity
func GenerateGo(schemaData map[string]interface{}, typeName string) (string, error) {
	// Parse schema
	schema, err := parseSchema(schemaData)
	if err != nil {
		return "", fmt.Errorf("failed to parse schema: %w", err)
	}

	// Verify the requested type exists
	if _, ok := schema.Types[typeName]; !ok {
		return "", fmt.Errorf("type %s not found in schema", typeName)
	}

	// Determine default endianness
	endianness := "big_endian"
	if schema.Config != nil && schema.Config.Endianness != "" {
		endianness = schema.Config.Endianness
	}

	// Generate code
	var buf bytes.Buffer

	// Package and imports
	buf.WriteString("package main\n\n")
	buf.WriteString("import (\n")
	buf.WriteString("\t\"github.com/anthropics/binschema/runtime\"\n")
	buf.WriteString(")\n\n")

	// Generate ALL types in the schema (simpler - always same logic)
	// Types are generated in map iteration order which is fine since Go
	// doesn't require forward declarations
	for name, typeDef := range schema.Types {
		// Generate struct type
		if err := generateStruct(&buf, name, typeDef); err != nil {
			return "", err
		}

		// Generate Encode method
		if err := generateEncodeMethod(&buf, name, typeDef, endianness); err != nil {
			return "", err
		}

		// Generate Decode function
		if err := generateDecodeFunction(&buf, name, typeDef, endianness); err != nil {
			return "", err
		}
	}

	return buf.String(), nil
}

func generateStruct(buf *bytes.Buffer, name string, typeDef *TypeDef) error {
	buf.WriteString(fmt.Sprintf("type %s struct {\n", name))

	for _, field := range typeDef.Sequence {
		goType, err := mapTypeToGo(field)
		if err != nil {
			return err
		}

		// Capitalize field name for export
		fieldName := capitalizeFirst(field.Name)
		buf.WriteString(fmt.Sprintf("\t%s %s\n", fieldName, goType))
	}

	buf.WriteString("}\n\n")
	return nil
}

func generateEncodeMethod(buf *bytes.Buffer, typeName string, typeDef *TypeDef, defaultEndianness string) error {
	buf.WriteString(fmt.Sprintf("func (m *%s) Encode() ([]byte, error) {\n", typeName))

	// Determine bit order (for now always MSBFirst)
	buf.WriteString("\tencoder := runtime.NewBitStreamEncoder(runtime.MSBFirst)\n\n")

	// Generate encoding logic for each field
	for _, field := range typeDef.Sequence {
		if err := generateEncodeField(buf, field, defaultEndianness); err != nil {
			return err
		}
	}

	buf.WriteString("\n\treturn encoder.Finish(), nil\n")
	buf.WriteString("}\n\n")
	return nil
}

func generateEncodeField(buf *bytes.Buffer, field Field, defaultEndianness string) error {
	fieldName := "m." + capitalizeFirst(field.Name)
	endianness := field.Endianness
	if endianness == "" {
		endianness = defaultEndianness
	}
	runtimeEndianness := mapEndianness(endianness)

	// Handle conditional fields
	if field.Conditional != "" {
		goCondition := convertConditionalToGo(field.Conditional, "m")
		buf.WriteString(fmt.Sprintf("\tif %s {\n", goCondition))
		defer buf.WriteString("\t}\n")
		// Increase indentation for the conditional block
		if err := generateEncodeFieldImpl(buf, field, fieldName, endianness, runtimeEndianness, "\t\t"); err != nil {
			return err
		}
		return nil
	}

	return generateEncodeFieldImpl(buf, field, fieldName, endianness, runtimeEndianness, "\t")
}

func generateEncodeFieldImpl(buf *bytes.Buffer, field Field, fieldName, endianness, runtimeEndianness, indent string) error {
	switch field.Type {
	case "uint8":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteUint8(%s)\n", indent, fieldName))
	case "uint16":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteUint16(%s, runtime.%s)\n", indent, fieldName, runtimeEndianness))
	case "uint32":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteUint32(%s, runtime.%s)\n", indent, fieldName, runtimeEndianness))
	case "uint64":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteUint64(%s, runtime.%s)\n", indent, fieldName, runtimeEndianness))
	case "int8":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteInt8(%s)\n", indent, fieldName))
	case "int16":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteInt16(%s, runtime.%s)\n", indent, fieldName, runtimeEndianness))
	case "int32":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteInt32(%s, runtime.%s)\n", indent, fieldName, runtimeEndianness))
	case "int64":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteInt64(%s, runtime.%s)\n", indent, fieldName, runtimeEndianness))
	case "float32":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteFloat32(%s, runtime.%s)\n", indent, fieldName, runtimeEndianness))
	case "float64":
		buf.WriteString(fmt.Sprintf("%sencoder.WriteFloat64(%s, runtime.%s)\n", indent, fieldName, runtimeEndianness))
	case "string":
		return generateEncodeString(buf, field, fieldName, endianness, indent)
	case "array":
		return generateEncodeArray(buf, field, fieldName, endianness, runtimeEndianness, indent)
	default:
		// Type reference - nested struct
		// Generate unique variable name for bytes
		bytesVar := strings.ReplaceAll(strings.ReplaceAll(fieldName, ".", "_"), "m_", "") + "_bytes"

		// Call the nested struct's Encode method and write the bytes
		buf.WriteString(fmt.Sprintf("%s%s, err := %s.Encode()\n", indent, bytesVar, fieldName))
		buf.WriteString(fmt.Sprintf("%sif err != nil {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\treturn nil, err\n", indent))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))
		buf.WriteString(fmt.Sprintf("%sfor _, b := range %s {\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint8(b)\n", indent))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))
	}

	return nil
}

func generateEncodeString(buf *bytes.Buffer, field Field, fieldName, endianness, indent string) error {
	encoding := field.Encoding
	if encoding == "" {
		encoding = "utf8"
	}

	// Generate unique variable name for bytes
	bytesVar := strings.ReplaceAll(strings.ReplaceAll(fieldName, ".", "_"), "m_", "") + "_bytes"

	// Convert string to bytes
	if encoding == "utf8" {
		buf.WriteString(fmt.Sprintf("%s%s := []byte(%s)\n", indent, bytesVar, fieldName))
	} else if encoding == "ascii" {
		buf.WriteString(fmt.Sprintf("%s%s := make([]byte, len(%s))\n", indent, bytesVar, fieldName))
		buf.WriteString(fmt.Sprintf("%sfor i := 0; i < len(%s); i++ {\n", indent, fieldName))
		buf.WriteString(fmt.Sprintf("%s\t%s[i] = %s[i]\n", indent, bytesVar, fieldName))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))
	}

	switch field.Kind {
	case "length_prefixed":
		lengthType := field.LengthType
		if lengthType == "" {
			lengthType = "uint8"
		}
		// Write length prefix
		switch lengthType {
		case "uint8":
			buf.WriteString(fmt.Sprintf("%sencoder.WriteUint8(uint8(len(%s)))\n", indent, bytesVar))
		case "uint16":
			buf.WriteString(fmt.Sprintf("%sencoder.WriteUint16(uint16(len(%s)), runtime.%s)\n", indent, bytesVar, mapEndianness(endianness)))
		case "uint32":
			buf.WriteString(fmt.Sprintf("%sencoder.WriteUint32(uint32(len(%s)), runtime.%s)\n", indent, bytesVar, mapEndianness(endianness)))
		case "uint64":
			buf.WriteString(fmt.Sprintf("%sencoder.WriteUint64(uint64(len(%s)), runtime.%s)\n", indent, bytesVar, mapEndianness(endianness)))
		}
		// Write bytes
		buf.WriteString(fmt.Sprintf("%sfor _, b := range %s {\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint8(b)\n", indent))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))

	case "null_terminated":
		// Write bytes
		buf.WriteString(fmt.Sprintf("%sfor _, b := range %s {\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint8(b)\n", indent))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))
		// Write null terminator
		buf.WriteString(fmt.Sprintf("%sencoder.WriteUint8(0)\n", indent))

	case "fixed":
		// Write bytes (padded or truncated)
		length := 0
		if field.Length != nil {
			if intLen, ok := field.Length.(float64); ok {
				length = int(intLen)
			}
		}
		buf.WriteString(fmt.Sprintf("%sfor i := 0; i < %d; i++ {\n", indent, length))
		buf.WriteString(fmt.Sprintf("%s\tif i < len(%s) {\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%s\t\tencoder.WriteUint8(%s[i])\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%s\t} else {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t\tencoder.WriteUint8(0)\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t}\n", indent))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))
	}

	return nil
}

func generateEncodeArray(buf *bytes.Buffer, field Field, fieldName, endianness, runtimeEndianness, indent string) error {
	// Write array length prefix if length_prefixed or length_prefixed_items
	if field.Kind == "length_prefixed" || field.Kind == "length_prefixed_items" {
		lengthType := field.LengthType
		if lengthType == "" {
			lengthType = "uint8"
		}
		switch lengthType {
		case "uint8":
			buf.WriteString(fmt.Sprintf("%sencoder.WriteUint8(uint8(len(%s)))\n", indent, fieldName))
		case "uint16":
			buf.WriteString(fmt.Sprintf("%sencoder.WriteUint16(uint16(len(%s)), runtime.%s)\n", indent, fieldName, runtimeEndianness))
		case "uint32":
			buf.WriteString(fmt.Sprintf("%sencoder.WriteUint32(uint32(len(%s)), runtime.%s)\n", indent, fieldName, runtimeEndianness))
		case "uint64":
			buf.WriteString(fmt.Sprintf("%sencoder.WriteUint64(uint64(len(%s)), runtime.%s)\n", indent, fieldName, runtimeEndianness))
		}
	}

	// Generate unique loop variable
	itemVar := strings.ReplaceAll(strings.ReplaceAll(fieldName, ".", "_"), "m_", "") + "_item"

	// For length_prefixed_items, we need to encode each item separately to measure its length
	if field.Kind == "length_prefixed_items" {
		return generateEncodeLengthPrefixedItems(buf, field, fieldName, itemVar, endianness, runtimeEndianness, indent)
	}

	// Write array elements (regular length_prefixed, fixed, null_terminated)
	buf.WriteString(fmt.Sprintf("%sfor _, %s := range %s {\n", indent, itemVar, fieldName))
	if field.Items != nil {
		if err := generateEncodeFieldImpl(buf, *field.Items, itemVar, endianness, runtimeEndianness, indent+"\t"); err != nil {
			return err
		}
	}
	buf.WriteString(fmt.Sprintf("%s}\n", indent))

	// Write null terminator for null_terminated arrays
	if field.Kind == "null_terminated" {
		buf.WriteString(fmt.Sprintf("%sencoder.WriteUint8(0)\n", indent))
	}

	return nil
}

func generateEncodeLengthPrefixedItems(buf *bytes.Buffer, field Field, fieldName, itemVar, endianness, runtimeEndianness, indent string) error {
	itemLengthType := field.ItemLengthType
	if itemLengthType == "" {
		itemLengthType = "uint32"
	}

	// For each item, encode it separately, measure length, write length then bytes
	buf.WriteString(fmt.Sprintf("%sfor _, %s := range %s {\n", indent, itemVar, fieldName))

	// Need to encode the item to get its byte length
	// For struct types, call Encode() method
	// For primitive types, use runtime to calculate size
	if field.Items != nil {
		itemType := field.Items.Type

		// Check if it's a custom type (struct)
		if itemType != "uint8" && itemType != "uint16" && itemType != "uint32" && itemType != "uint64" &&
			itemType != "int8" && itemType != "int16" && itemType != "int32" && itemType != "int64" &&
			itemType != "float32" && itemType != "float64" && itemType != "string" {
			// Custom type - call Encode()
			itemBytesVar := itemVar + "_bytes"
			buf.WriteString(fmt.Sprintf("%s\t%s, err := %s.Encode()\n", indent, itemBytesVar, itemVar))
			buf.WriteString(fmt.Sprintf("%s\tif err != nil {\n", indent))
			buf.WriteString(fmt.Sprintf("%s\t\treturn nil, err\n", indent))
			buf.WriteString(fmt.Sprintf("%s\t}\n", indent))

			// Write item length
			switch itemLengthType {
			case "uint8":
				buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint8(uint8(len(%s)))\n", indent, itemBytesVar))
			case "uint16":
				buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint16(uint16(len(%s)), runtime.%s)\n", indent, itemBytesVar, runtimeEndianness))
			case "uint32":
				buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint32(uint32(len(%s)), runtime.%s)\n", indent, itemBytesVar, runtimeEndianness))
			case "uint64":
				buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint64(uint64(len(%s)), runtime.%s)\n", indent, itemBytesVar, runtimeEndianness))
			}

			// Write item bytes
			buf.WriteString(fmt.Sprintf("%s\tfor _, b := range %s {\n", indent, itemBytesVar))
			buf.WriteString(fmt.Sprintf("%s\t\tencoder.WriteUint8(b)\n", indent))
			buf.WriteString(fmt.Sprintf("%s\t}\n", indent))
		} else {
			// Primitive type - write length then value
			// For primitives, length is fixed and known at compile time
			var itemSize int
			switch itemType {
			case "uint8", "int8":
				itemSize = 1
			case "uint16", "int16":
				itemSize = 2
			case "uint32", "int32", "float32":
				itemSize = 4
			case "uint64", "int64", "float64":
				itemSize = 8
			}

			// Write item length
			switch itemLengthType {
			case "uint8":
				buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint8(%d)\n", indent, itemSize))
			case "uint16":
				buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint16(%d, runtime.%s)\n", indent, itemSize, runtimeEndianness))
			case "uint32":
				buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint32(%d, runtime.%s)\n", indent, itemSize, runtimeEndianness))
			case "uint64":
				buf.WriteString(fmt.Sprintf("%s\tencoder.WriteUint64(%d, runtime.%s)\n", indent, itemSize, runtimeEndianness))
			}

			// Write item value
			if err := generateEncodeFieldImpl(buf, *field.Items, itemVar, endianness, runtimeEndianness, indent+"\t"); err != nil {
				return err
			}
		}
	}

	buf.WriteString(fmt.Sprintf("%s}\n", indent))
	return nil
}

func convertConditionalToGo(condition string, basePath string) string {
	// Simple conversion: "present == 1" -> "m.Present == 1"
	// For now, just do basic field name capitalization
	parts := strings.Split(condition, " ")
	if len(parts) >= 3 {
		fieldName := parts[0]
		operator := parts[1]
		value := strings.Join(parts[2:], " ")
		return fmt.Sprintf("%s.%s %s %s", basePath, capitalizeFirst(fieldName), operator, value)
	}
	return condition
}

func generateDecodeFunction(buf *bytes.Buffer, typeName string, typeDef *TypeDef, defaultEndianness string) error {
	// Generate public Decode function that creates a decoder
	buf.WriteString(fmt.Sprintf("func Decode%s(bytes []byte) (*%s, error) {\n", typeName, typeName))
	buf.WriteString("\tdecoder := runtime.NewBitStreamDecoder(bytes, runtime.MSBFirst)\n")
	buf.WriteString(fmt.Sprintf("\treturn decode%sWithDecoder(decoder)\n", typeName))
	buf.WriteString("}\n\n")

	// Generate helper that accepts an existing decoder (for nested structs)
	buf.WriteString(fmt.Sprintf("func decode%sWithDecoder(decoder *runtime.BitStreamDecoder) (*%s, error) {\n", typeName, typeName))
	buf.WriteString(fmt.Sprintf("\tresult := &%s{}\n\n", typeName))

	// Generate decoding logic for each field
	for _, field := range typeDef.Sequence {
		if err := generateDecodeField(buf, field, defaultEndianness); err != nil {
			return err
		}
	}

	buf.WriteString("\n\treturn result, nil\n")
	buf.WriteString("}\n")
	return nil
}

func generateDecodeField(buf *bytes.Buffer, field Field, defaultEndianness string) error {
	fieldName := capitalizeFirst(field.Name)
	varName := strings.ToLower(field.Name)
	endianness := field.Endianness
	if endianness == "" {
		endianness = defaultEndianness
	}
	runtimeEndianness := mapEndianness(endianness)

	// Handle conditional fields
	if field.Conditional != "" {
		goCondition := convertConditionalToGo(field.Conditional, "result")
		buf.WriteString(fmt.Sprintf("\tif %s {\n", goCondition))
		if err := generateDecodeFieldImpl(buf, field, fieldName, varName, endianness, runtimeEndianness, "\t\t"); err != nil {
			return err
		}
		buf.WriteString("\t}\n\n")
		return nil
	}

	return generateDecodeFieldImpl(buf, field, fieldName, varName, endianness, runtimeEndianness, "\t")
}

func generateDecodeFieldImpl(buf *bytes.Buffer, field Field, fieldName, varName, endianness, runtimeEndianness, indent string) error {
	switch field.Type {
	case "uint8":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadUint8()\n", indent, varName))
	case "uint16":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadUint16(runtime.%s)\n", indent, varName, runtimeEndianness))
	case "uint32":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadUint32(runtime.%s)\n", indent, varName, runtimeEndianness))
	case "uint64":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadUint64(runtime.%s)\n", indent, varName, runtimeEndianness))
	case "int8":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadInt8()\n", indent, varName))
	case "int16":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadInt16(runtime.%s)\n", indent, varName, runtimeEndianness))
	case "int32":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadInt32(runtime.%s)\n", indent, varName, runtimeEndianness))
	case "int64":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadInt64(runtime.%s)\n", indent, varName, runtimeEndianness))
	case "float32":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadFloat32(runtime.%s)\n", indent, varName, runtimeEndianness))
	case "float64":
		buf.WriteString(fmt.Sprintf("%s%s, err := decoder.ReadFloat64(runtime.%s)\n", indent, varName, runtimeEndianness))
	case "string":
		return generateDecodeString(buf, field, fieldName, varName, endianness, indent)
	case "array":
		return generateDecodeArray(buf, field, fieldName, varName, endianness, runtimeEndianness, indent)
	default:
		// Type reference - nested struct
		return generateDecodeNestedStruct(buf, field, fieldName, varName, indent)
	}

	buf.WriteString(fmt.Sprintf("%sif err != nil {\n", indent))
	buf.WriteString(fmt.Sprintf("%s\treturn nil, err\n", indent))
	buf.WriteString(fmt.Sprintf("%s}\n", indent))

	// Only assign to result if fieldName is not empty (for array items, fieldName is "")
	if fieldName != "" {
		buf.WriteString(fmt.Sprintf("%sresult.%s = %s\n\n", indent, fieldName, varName))
	}

	return nil
}

func generateDecodeNestedStruct(buf *bytes.Buffer, field Field, fieldName, varName, indent string) error {
	// For nested structs, call a helper decode function that accepts the decoder
	// This allows the decoder to continue sequentially
	typeName := capitalizeFirst(field.Type)
	buf.WriteString(fmt.Sprintf("%s%s, err := decode%sWithDecoder(decoder)\n", indent, varName, typeName))
	buf.WriteString(fmt.Sprintf("%sif err != nil {\n", indent))
	buf.WriteString(fmt.Sprintf("%s\treturn nil, err\n", indent))
	buf.WriteString(fmt.Sprintf("%s}\n", indent))
	buf.WriteString(fmt.Sprintf("%sresult.%s = *%s\n\n", indent, fieldName, varName))

	return nil
}

func generateDecodeString(buf *bytes.Buffer, field Field, fieldName, varName, endianness, indent string) error {
	encoding := field.Encoding
	if encoding == "" {
		encoding = "utf8"
	}

	bytesVar := varName + "_bytes"

	switch field.Kind {
	case "length_prefixed":
		lengthType := field.LengthType
		if lengthType == "" {
			lengthType = "uint8"
		}
		// Read length prefix
		switch lengthType {
		case "uint8":
			buf.WriteString(fmt.Sprintf("%slength, err := decoder.ReadUint8()\n", indent))
		case "uint16":
			buf.WriteString(fmt.Sprintf("%slength, err := decoder.ReadUint16(runtime.%s)\n", indent, mapEndianness(endianness)))
		case "uint32":
			buf.WriteString(fmt.Sprintf("%slength, err := decoder.ReadUint32(runtime.%s)\n", indent, mapEndianness(endianness)))
		case "uint64":
			buf.WriteString(fmt.Sprintf("%slength, err := decoder.ReadUint64(runtime.%s)\n", indent, mapEndianness(endianness)))
		}
		buf.WriteString(fmt.Sprintf("%sif err != nil {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\treturn nil, err\n", indent))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))

		// Read bytes
		buf.WriteString(fmt.Sprintf("%s%s := make([]byte, length)\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%sfor i := range %s {\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%s\tb, err := decoder.ReadUint8()\n", indent))
		buf.WriteString(fmt.Sprintf("%s\tif err != nil {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t\treturn nil, err\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t}\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t%s[i] = b\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))

	case "null_terminated":
		// Read until null terminator
		buf.WriteString(fmt.Sprintf("%s%s := []byte{}\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%sfor {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\tb, err := decoder.ReadUint8()\n", indent))
		buf.WriteString(fmt.Sprintf("%s\tif err != nil {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t\treturn nil, err\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t}\n", indent))
		buf.WriteString(fmt.Sprintf("%s\tif b == 0 {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t\tbreak\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t}\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t%s = append(%s, b)\n", indent, bytesVar, bytesVar))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))

	case "fixed":
		// Read fixed number of bytes
		length := 0
		if field.Length != nil {
			if intLen, ok := field.Length.(float64); ok {
				length = int(intLen)
			}
		}
		buf.WriteString(fmt.Sprintf("%s%s := make([]byte, 0)\n", indent, bytesVar))
		buf.WriteString(fmt.Sprintf("%sfor i := 0; i < %d; i++ {\n", indent, length))
		buf.WriteString(fmt.Sprintf("%s\tb, err := decoder.ReadUint8()\n", indent))
		buf.WriteString(fmt.Sprintf("%s\tif err != nil {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t\treturn nil, err\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t}\n", indent))
		buf.WriteString(fmt.Sprintf("%s\tif b != 0 {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\t\t%s = append(%s, b)\n", indent, bytesVar, bytesVar))
		buf.WriteString(fmt.Sprintf("%s\t}\n", indent))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))
	}

	// Convert bytes to string
	if encoding == "utf8" {
		buf.WriteString(fmt.Sprintf("%sresult.%s = string(%s)\n\n", indent, fieldName, bytesVar))
	} else if encoding == "ascii" {
		buf.WriteString(fmt.Sprintf("%sresult.%s = string(%s)\n\n", indent, fieldName, bytesVar))
	}

	return nil
}

func generateDecodeArray(buf *bytes.Buffer, field Field, fieldName, varName, endianness, runtimeEndianness, indent string) error {
	if field.Items == nil {
		return fmt.Errorf("array field missing items definition")
	}

	itemType, err := mapTypeToGo(*field.Items)
	if err != nil {
		return err
	}

	// Read length prefix if length_prefixed or length_prefixed_items
	if field.Kind == "length_prefixed" || field.Kind == "length_prefixed_items" {
		lengthType := field.LengthType
		if lengthType == "" {
			lengthType = "uint8"
		}
		switch lengthType {
		case "uint8":
			buf.WriteString(fmt.Sprintf("%slength, err := decoder.ReadUint8()\n", indent))
		case "uint16":
			buf.WriteString(fmt.Sprintf("%slength, err := decoder.ReadUint16(runtime.%s)\n", indent, runtimeEndianness))
		case "uint32":
			buf.WriteString(fmt.Sprintf("%slength, err := decoder.ReadUint32(runtime.%s)\n", indent, runtimeEndianness))
		case "uint64":
			buf.WriteString(fmt.Sprintf("%slength, err := decoder.ReadUint64(runtime.%s)\n", indent, runtimeEndianness))
		}
		buf.WriteString(fmt.Sprintf("%sif err != nil {\n", indent))
		buf.WriteString(fmt.Sprintf("%s\treturn nil, err\n", indent))
		buf.WriteString(fmt.Sprintf("%s}\n", indent))
		buf.WriteString(fmt.Sprintf("%sresult.%s = make([]%s, length)\n", indent, fieldName, itemType))

		// For length_prefixed_items, handle per-item lengths
		if field.Kind == "length_prefixed_items" {
			return generateDecodeLengthPrefixedItems(buf, field, fieldName, varName, endianness, runtimeEndianness, indent)
		}

		buf.WriteString(fmt.Sprintf("%sfor i := range result.%s {\n", indent, fieldName))
	} else if field.Kind == "null_terminated" {
		// Read until null terminator
		buf.WriteString(fmt.Sprintf("%sresult.%s = []%s{}\n", indent, fieldName, itemType))
		buf.WriteString(fmt.Sprintf("%sfor {\n", indent))
	} else if field.Kind == "fixed" {
		// Fixed array - read a compile-time known number of elements
		length := 0
		if field.Length != nil {
			if intLen, ok := field.Length.(float64); ok {
				length = int(intLen)
			} else if strLen, ok := field.Length.(string); ok {
				// Field reference - not yet implemented
				return fmt.Errorf("field-referenced array lengths not yet implemented (length field: %s)", strLen)
			}
		}
		buf.WriteString(fmt.Sprintf("%sresult.%s = make([]%s, %d)\n", indent, fieldName, itemType, length))
		buf.WriteString(fmt.Sprintf("%sfor i := 0; i < %d; i++ {\n", indent, length))
	} else {
		return fmt.Errorf("unknown array kind: %s", field.Kind)
	}

	// Read item
	itemVar := varName + "_item"
	if err := generateDecodeFieldImpl(buf, *field.Items, "", itemVar, endianness, runtimeEndianness, indent+"\t"); err != nil {
		return err
	}

	if field.Kind == "length_prefixed" || field.Kind == "fixed" {
		buf.WriteString(fmt.Sprintf("%s\tresult.%s[i] = %s\n", indent, fieldName, itemVar))
		buf.WriteString(fmt.Sprintf("%s}\n\n", indent))
	} else if field.Kind == "null_terminated" {
		// Check for null terminator
		buf.WriteString(fmt.Sprintf("%s\t// TODO: Check for null terminator\n", indent))
		buf.WriteString(fmt.Sprintf("%s\tresult.%s = append(result.%s, %s)\n", indent, fieldName, fieldName, itemVar))
		buf.WriteString(fmt.Sprintf("%s}\n\n", indent))
	}

	return nil
}

func generateDecodeLengthPrefixedItems(buf *bytes.Buffer, field Field, fieldName, varName, endianness, runtimeEndianness, indent string) error {
	itemLengthType := field.ItemLengthType
	if itemLengthType == "" {
		itemLengthType = "uint32"
	}

	// For each item, read the item length, then read exactly that many bytes
	buf.WriteString(fmt.Sprintf("%sfor i := range result.%s {\n", indent, fieldName))

	// Read item length
	itemLengthVar := varName + "_item_length"
	switch itemLengthType {
	case "uint8":
		buf.WriteString(fmt.Sprintf("%s\t%s, err := decoder.ReadUint8()\n", indent, itemLengthVar))
	case "uint16":
		buf.WriteString(fmt.Sprintf("%s\t%s, err := decoder.ReadUint16(runtime.%s)\n", indent, itemLengthVar, runtimeEndianness))
	case "uint32":
		buf.WriteString(fmt.Sprintf("%s\t%s, err := decoder.ReadUint32(runtime.%s)\n", indent, itemLengthVar, runtimeEndianness))
	case "uint64":
		buf.WriteString(fmt.Sprintf("%s\t%s, err := decoder.ReadUint64(runtime.%s)\n", indent, itemLengthVar, runtimeEndianness))
	}
	buf.WriteString(fmt.Sprintf("%s\tif err != nil {\n", indent))
	buf.WriteString(fmt.Sprintf("%s\t\treturn nil, err\n", indent))
	buf.WriteString(fmt.Sprintf("%s\t}\n", indent))

	// Read item bytes
	itemBytesVar := varName + "_item_bytes"
	buf.WriteString(fmt.Sprintf("%s\t%s := make([]byte, %s)\n", indent, itemBytesVar, itemLengthVar))
	buf.WriteString(fmt.Sprintf("%s\tfor j := range %s {\n", indent, itemBytesVar))
	buf.WriteString(fmt.Sprintf("%s\t\tb, err := decoder.ReadUint8()\n", indent))
	buf.WriteString(fmt.Sprintf("%s\t\tif err != nil {\n", indent))
	buf.WriteString(fmt.Sprintf("%s\t\t\treturn nil, err\n", indent))
	buf.WriteString(fmt.Sprintf("%s\t\t}\n", indent))
	buf.WriteString(fmt.Sprintf("%s\t\t%s[j] = b\n", indent, itemBytesVar))
	buf.WriteString(fmt.Sprintf("%s\t}\n", indent))

	// Decode the item from bytes
	if field.Items != nil {
		itemType := field.Items.Type

		// Check if it's a custom type (struct)
		if itemType != "uint8" && itemType != "uint16" && itemType != "uint32" && itemType != "uint64" &&
			itemType != "int8" && itemType != "int16" && itemType != "int32" && itemType != "int64" &&
			itemType != "float32" && itemType != "float64" && itemType != "string" {
			// Custom type - call Decode function
			typeName := capitalizeFirst(itemType)
			buf.WriteString(fmt.Sprintf("%s\titem, err := Decode%s(%s)\n", indent, typeName, itemBytesVar))
			buf.WriteString(fmt.Sprintf("%s\tif err != nil {\n", indent))
			buf.WriteString(fmt.Sprintf("%s\t\treturn nil, err\n", indent))
			buf.WriteString(fmt.Sprintf("%s\t}\n", indent))
			buf.WriteString(fmt.Sprintf("%s\tresult.%s[i] = *item\n", indent, fieldName))
		} else {
			// Primitive type - decode directly from the already-read bytes
			// The item length was already validated, so we just need to decode from the byte slice
			itemVar := varName + "_item"
			itemType := field.Items.Type

			switch itemType {
			case "uint8":
				buf.WriteString(fmt.Sprintf("%s\t%s := %s[0]\n", indent, itemVar, itemBytesVar))
			case "uint16":
				if endianness == "little_endian" {
					buf.WriteString(fmt.Sprintf("%s\t%s := uint16(%s[0]) | uint16(%s[1])<<8\n", indent, itemVar, itemBytesVar, itemBytesVar))
				} else {
					buf.WriteString(fmt.Sprintf("%s\t%s := uint16(%s[0])<<8 | uint16(%s[1])\n", indent, itemVar, itemBytesVar, itemBytesVar))
				}
			case "uint32":
				if endianness == "little_endian" {
					buf.WriteString(fmt.Sprintf("%s\t%s := uint32(%s[0]) | uint32(%s[1])<<8 | uint32(%s[2])<<16 | uint32(%s[3])<<24\n", indent, itemVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar))
				} else {
					buf.WriteString(fmt.Sprintf("%s\t%s := uint32(%s[0])<<24 | uint32(%s[1])<<16 | uint32(%s[2])<<8 | uint32(%s[3])\n", indent, itemVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar))
				}
			case "uint64":
				if endianness == "little_endian" {
					buf.WriteString(fmt.Sprintf("%s\t%s := uint64(%s[0]) | uint64(%s[1])<<8 | uint64(%s[2])<<16 | uint64(%s[3])<<24 | uint64(%s[4])<<32 | uint64(%s[5])<<40 | uint64(%s[6])<<48 | uint64(%s[7])<<56\n", indent, itemVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar))
				} else {
					buf.WriteString(fmt.Sprintf("%s\t%s := uint64(%s[0])<<56 | uint64(%s[1])<<48 | uint64(%s[2])<<40 | uint64(%s[3])<<32 | uint64(%s[4])<<24 | uint64(%s[5])<<16 | uint64(%s[6])<<8 | uint64(%s[7])\n", indent, itemVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar, itemBytesVar))
				}
			// TODO: Add int8, int16, int32, int64, float32, float64
			default:
				return fmt.Errorf("unsupported primitive type for length_prefixed_items: %s", itemType)
			}

			buf.WriteString(fmt.Sprintf("%s\tresult.%s[i] = %s\n", indent, fieldName, itemVar))
		}
	}

	buf.WriteString(fmt.Sprintf("%s}\n\n", indent))
	return nil
}

func mapTypeToGo(field Field) (string, error) {
	switch field.Type {
	case "uint8":
		return "uint8", nil
	case "uint16":
		return "uint16", nil
	case "uint32":
		return "uint32", nil
	case "uint64":
		return "uint64", nil
	case "int8":
		return "int8", nil
	case "int16":
		return "int16", nil
	case "int32":
		return "int32", nil
	case "int64":
		return "int64", nil
	case "float32":
		return "float32", nil
	case "float64":
		return "float64", nil
	case "string":
		return "string", nil
	case "array":
		if field.Items == nil {
			return "", fmt.Errorf("array field missing items definition")
		}
		itemType, err := mapTypeToGo(*field.Items)
		if err != nil {
			return "", err
		}
		return "[]" + itemType, nil
	default:
		// Assume it's a type reference (nested struct)
		return capitalizeFirst(field.Type), nil
	}
}

func mapEndianness(endianness string) string {
	if endianness == "little_endian" {
		return "LittleEndian"
	}
	return "BigEndian"
}

func capitalizeFirst(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func parseField(fieldData map[string]interface{}) Field {
	field := Field{}

	if name, ok := fieldData["name"].(string); ok {
		field.Name = name
	}
	if fieldType, ok := fieldData["type"].(string); ok {
		field.Type = fieldType
	}
	if kind, ok := fieldData["kind"].(string); ok {
		field.Kind = kind
	}
	if length, ok := fieldData["length"]; ok {
		field.Length = length
	}
	if lengthType, ok := fieldData["length_type"].(string); ok {
		field.LengthType = lengthType
	}
	if itemLengthType, ok := fieldData["item_length_type"].(string); ok {
		field.ItemLengthType = itemLengthType
	}
	if encoding, ok := fieldData["encoding"].(string); ok {
		field.Encoding = encoding
	}
	if conditional, ok := fieldData["conditional"].(string); ok {
		field.Conditional = conditional
	}
	if endianness, ok := fieldData["endianness"].(string); ok {
		field.Endianness = endianness
	}

	// Parse items for arrays
	if itemsData, ok := fieldData["items"].(map[string]interface{}); ok {
		items := parseField(itemsData)
		field.Items = &items
	}

	return field
}

func parseSchema(data map[string]interface{}) (*Schema, error) {
	schema := &Schema{
		Types: make(map[string]*TypeDef),
	}

	// Parse config
	if configData, ok := data["config"].(map[string]interface{}); ok {
		schema.Config = &SchemaConfig{}
		if endianness, ok := configData["endianness"].(string); ok {
			schema.Config.Endianness = endianness
		}
		if bitOrder, ok := configData["bit_order"].(string); ok {
			schema.Config.BitOrder = bitOrder
		}
	}

	// Parse types
	if typesData, ok := data["types"].(map[string]interface{}); ok {
		for typeName, typeDataRaw := range typesData {
			typeData, ok := typeDataRaw.(map[string]interface{})
			if !ok {
				continue
			}

			typeDef := &TypeDef{}

			// Parse sequence
			if sequenceData, ok := typeData["sequence"].([]interface{}); ok {
				for _, fieldRaw := range sequenceData {
					fieldData, ok := fieldRaw.(map[string]interface{})
					if !ok {
						continue
					}

					field := parseField(fieldData)
					typeDef.Sequence = append(typeDef.Sequence, field)
				}
			}

			schema.Types[typeName] = typeDef
		}
	}

	return schema, nil
}

// Template helpers (for future expansion)
var templateFuncs = template.FuncMap{
	"capitalize": capitalizeFirst,
	"mapType":    func(field Field) string { result, _ := mapTypeToGo(field); return result },
}
