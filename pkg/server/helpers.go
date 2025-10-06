package server

// safeDeref safely dereferences a pointer, returning a default value if nil
func safeDeref[T any](ptr *T, defaultVal T) T {
	if ptr == nil {
		return defaultVal
	}
	return *ptr
}
