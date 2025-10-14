package runtime

// Error codes for cross-language compatibility.
// These match the TypeScript implementation exactly.
const (
	// ErrorIncompleteData indicates not enough bytes in buffer (need more network data)
	ErrorIncompleteData = "INCOMPLETE_DATA"

	// ErrorInvalidValue indicates value out of range or invalid for type
	ErrorInvalidValue = "INVALID_VALUE"

	// ErrorSchemaMismatch indicates data doesn't match schema expectations
	ErrorSchemaMismatch = "SCHEMA_MISMATCH"

	// ErrorCircularReference indicates infinite loop in pointer structures
	ErrorCircularReference = "CIRCULAR_REFERENCE"
)
