// Vendored from github.com/anthropics/binschema/runtime
package runtime

// EncodingContext holds state needed during encoding for computed fields.
// It enables multi-pass encoding, parent references, and position tracking.
type EncodingContext struct {
	// Parents holds parent objects for ../field references.
	// Each entry is a map of field name -> value.
	// The last element is the immediate parent, first is the root.
	Parents []map[string]any

	// ArrayIterations tracks active array loops for corresponding<Type> correlations.
	ArrayIterations map[string]*ArrayIteration

	// Positions tracks byte positions for position_of computed fields.
	// Key format: "arrayName_typeName", Value: slice of positions for each occurrence.
	Positions map[string][]int

	// TypeIndices tracks type occurrence counters for corresponding<Type> correlations.
	// Outer key: array name, Inner key: type name, Value: occurrence count.
	// Shared across all contexts to persist counters across iterations.
	TypeIndices map[string]map[string]int

	// ByteOffset tracks absolute byte offset across encoder boundaries.
	// Used for back-reference support and position calculations.
	ByteOffset int

	// CompressionDict maps serialized values to their byte offsets for back_reference compression.
	// When a value is first encoded, its offset is recorded. Subsequent references can use
	// compression pointers (like DNS name compression) instead of re-encoding the value.
	// Shared across all contexts to enable cross-encoder compression.
	CompressionDict map[string]int
}

// ArrayIteration tracks state of an array being encoded.
// Used for corresponding<Type>, first<Type>, and last<Type> selectors.
type ArrayIteration struct {
	Items       any            // The array being iterated
	Index       int            // Current index in the array
	FieldName   string         // Name of the array field
	TypeIndices map[string]int // Type occurrence counters for choice/discriminated union arrays
}

// NewEncodingContext creates an empty encoding context.
func NewEncodingContext() *EncodingContext {
	return &EncodingContext{
		Parents:         make([]map[string]any, 0),
		ArrayIterations: make(map[string]*ArrayIteration),
		Positions:       make(map[string][]int),
		TypeIndices:     make(map[string]map[string]int),
		ByteOffset:      0,
		CompressionDict: make(map[string]int),
	}
}

// ExtendWithParent creates a new context with an additional parent added.
// The new parent becomes the most recent (innermost) parent.
// ArrayIterations, Positions, TypeIndices, and CompressionDict are shared (not copied) for efficient updates.
func (ctx *EncodingContext) ExtendWithParent(parent map[string]any) *EncodingContext {
	if ctx == nil {
		ctx = NewEncodingContext()
	}

	newParents := make([]map[string]any, len(ctx.Parents)+1)
	copy(newParents, ctx.Parents)
	newParents[len(ctx.Parents)] = parent

	return &EncodingContext{
		Parents:         newParents,
		ArrayIterations: ctx.ArrayIterations, // Shared reference
		Positions:       ctx.Positions,       // Shared reference
		TypeIndices:     ctx.TypeIndices,     // Shared reference
		ByteOffset:      ctx.ByteOffset,
		CompressionDict: ctx.CompressionDict, // Shared reference
	}
}

// ExtendWithArrayIteration creates a new context with an array iteration added.
// TypeIndices and CompressionDict are shared at the EncodingContext level to persist state across iterations.
func (ctx *EncodingContext) ExtendWithArrayIteration(fieldName string, items any, index int) *EncodingContext {
	if ctx == nil {
		ctx = NewEncodingContext()
	}

	// Create a new ArrayIterations map that includes the new iteration
	newIterations := make(map[string]*ArrayIteration, len(ctx.ArrayIterations)+1)
	for k, v := range ctx.ArrayIterations {
		newIterations[k] = v
	}
	newIterations[fieldName] = &ArrayIteration{
		Items:     items,
		Index:     index,
		FieldName: fieldName,
		// TypeIndices is now stored at the context level, not per-iteration
	}

	return &EncodingContext{
		Parents:         ctx.Parents,
		ArrayIterations: newIterations,
		Positions:       ctx.Positions,       // Shared reference
		TypeIndices:     ctx.TypeIndices,     // Shared reference (persists across iterations)
		ByteOffset:      ctx.ByteOffset,
		CompressionDict: ctx.CompressionDict, // Shared reference (persists across iterations)
	}
}

// GetParentField retrieves a field value from N levels up in the parent chain.
// levelsUp=1 means the immediate parent, levelsUp=2 means the grandparent, etc.
func (ctx *EncodingContext) GetParentField(levelsUp int, fieldName string) (any, bool) {
	if ctx == nil || len(ctx.Parents) == 0 {
		return nil, false
	}

	idx := len(ctx.Parents) - levelsUp
	if idx < 0 || idx >= len(ctx.Parents) {
		return nil, false
	}

	val, ok := ctx.Parents[idx][fieldName]
	return val, ok
}

// FindParentField searches through all parents to find a field by name.
// Searches from outermost (root) to innermost (immediate parent).
// Returns the field value and true if found, nil and false otherwise.
func (ctx *EncodingContext) FindParentField(fieldName string) (any, bool) {
	if ctx == nil || len(ctx.Parents) == 0 {
		return nil, false
	}

	// Search from outermost to innermost (like TypeScript's for-of loop)
	for _, parent := range ctx.Parents {
		if val, ok := parent[fieldName]; ok {
			return val, true
		}
	}
	return nil, false
}

// GetPosition retrieves tracked positions for an array/type combination.
// Key format is "arrayName_typeName".
func (ctx *EncodingContext) GetPosition(key string, index int) (int, bool) {
	if ctx == nil || ctx.Positions == nil {
		return 0, false
	}

	positions, ok := ctx.Positions[key]
	if !ok || index < 0 || index >= len(positions) {
		return 0, false
	}

	return positions[index], true
}

// GetFirstPosition retrieves the first tracked position for an array/type combination.
func (ctx *EncodingContext) GetFirstPosition(key string) (int, bool) {
	if ctx == nil || ctx.Positions == nil {
		return 0, false
	}

	positions, ok := ctx.Positions[key]
	if !ok || len(positions) == 0 {
		return 0, false
	}

	return positions[0], true
}

// GetLastPosition retrieves the last tracked position for an array/type combination.
func (ctx *EncodingContext) GetLastPosition(key string) (int, bool) {
	if ctx == nil || ctx.Positions == nil {
		return 0, false
	}

	positions, ok := ctx.Positions[key]
	if !ok || len(positions) == 0 {
		return 0, false
	}

	return positions[len(positions)-1], true
}

// TrackPosition adds a position to the tracking for an array/type combination.
func (ctx *EncodingContext) TrackPosition(key string, position int) {
	if ctx == nil {
		return
	}

	if ctx.Positions == nil {
		ctx.Positions = make(map[string][]int)
	}

	ctx.Positions[key] = append(ctx.Positions[key], position)
}

// GetArrayIteration retrieves the current array iteration state for a field.
func (ctx *EncodingContext) GetArrayIteration(fieldName string) (*ArrayIteration, bool) {
	if ctx == nil || ctx.ArrayIterations == nil {
		return nil, false
	}

	iter, ok := ctx.ArrayIterations[fieldName]
	return iter, ok
}

// GetAnyArrayIteration retrieves any active array iteration for cross-array correlation.
// Returns the iteration and true if any iteration is found.
// This is used when cross-referencing between sibling arrays.
func (ctx *EncodingContext) GetAnyArrayIteration() (*ArrayIteration, bool) {
	if ctx == nil || ctx.ArrayIterations == nil || len(ctx.ArrayIterations) == 0 {
		return nil, false
	}

	// Return the first (and typically only) active iteration
	for _, iter := range ctx.ArrayIterations {
		return iter, true
	}
	return nil, false
}

// GetTypeIndex retrieves the type occurrence index for a discriminated union type.
// Uses the context-level TypeIndices which is shared across all iterations.
func (ctx *EncodingContext) GetTypeIndex(arrayFieldName, typeName string) int {
	if ctx == nil || ctx.TypeIndices == nil {
		return 0
	}

	arrayIndices, ok := ctx.TypeIndices[arrayFieldName]
	if !ok {
		return 0
	}

	return arrayIndices[typeName]
}

// IncrementTypeIndex increments the type occurrence counter and returns the new value.
// Uses the context-level TypeIndices which is shared across all iterations.
func (ctx *EncodingContext) IncrementTypeIndex(arrayFieldName, typeName string) int {
	if ctx == nil {
		return 0
	}

	if ctx.TypeIndices == nil {
		ctx.TypeIndices = make(map[string]map[string]int)
	}

	if ctx.TypeIndices[arrayFieldName] == nil {
		ctx.TypeIndices[arrayFieldName] = make(map[string]int)
	}

	ctx.TypeIndices[arrayFieldName][typeName]++
	return ctx.TypeIndices[arrayFieldName][typeName]
}

// WithByteOffset creates a new context with an updated byte offset.
func (ctx *EncodingContext) WithByteOffset(offset int) *EncodingContext {
	if ctx == nil {
		ctx = NewEncodingContext()
	}

	return &EncodingContext{
		Parents:         ctx.Parents,
		ArrayIterations: ctx.ArrayIterations,
		Positions:       ctx.Positions,
		TypeIndices:     ctx.TypeIndices,
		ByteOffset:      offset,
		CompressionDict: ctx.CompressionDict,
	}
}

// GetCompressionOffset retrieves the byte offset for a serialized value from the compression dictionary.
// Returns the offset and true if found, 0 and false otherwise.
func (ctx *EncodingContext) GetCompressionOffset(valueKey string) (int, bool) {
	if ctx == nil || ctx.CompressionDict == nil {
		return 0, false
	}
	offset, ok := ctx.CompressionDict[valueKey]
	return offset, ok
}

// SetCompressionOffset records a value's byte offset in the compression dictionary.
func (ctx *EncodingContext) SetCompressionOffset(valueKey string, offset int) {
	if ctx == nil {
		return
	}
	if ctx.CompressionDict == nil {
		ctx.CompressionDict = make(map[string]int)
	}
	ctx.CompressionDict[valueKey] = offset
}
