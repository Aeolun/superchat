.PHONY: test coverage coverage-html coverage-lcov coverage-protocol coverage-summary fuzz clean build run-server run-client run-website docker-build docker-run docker-push

# Run all tests
test:
	go test ./... -race

# Generate coverage for all packages (combined)
coverage:
	go test ./... -coverprofile=coverage.out -covermode=atomic
	go tool cover -func=coverage.out

# Generate HTML coverage report (combined)
coverage-html:
	go test ./... -coverprofile=coverage.out -covermode=atomic
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Generate separate lcov files per package
coverage-lcov:
	@echo "Generating coverage for protocol package..."
	go test ./pkg/protocol/... -coverprofile=protocol.out -covermode=atomic
	gcov2lcov -infile=protocol.out -outfile=protocol.lcov

	@echo "Generating coverage for server package..."
	go test ./pkg/server/... -coverprofile=server.out -covermode=atomic
	gcov2lcov -infile=server.out -outfile=server.lcov

	@echo "Generating coverage for client package..."
	go test ./pkg/client/... -coverprofile=client.out -covermode=atomic
	gcov2lcov -infile=client.out -outfile=client.lcov

	@echo ""
	@echo "LCOV coverage reports generated:"
	@echo "  - protocol.lcov (pkg/protocol)"
	@echo "  - server.lcov   (pkg/server)"
	@echo "  - client.lcov   (pkg/client)"

# Check protocol coverage (must be 100%)
coverage-protocol:
	go test ./pkg/protocol/... -coverprofile=protocol.out -covermode=atomic
	@COVERAGE=$$(go tool cover -func=protocol.out | grep total | awk '{print $$3}' | sed 's/%//'); \
	echo "Protocol coverage: $$COVERAGE%"; \
	if [ $$(echo "$$COVERAGE < 100" | bc -l) -eq 1 ]; then \
		echo "ERROR: Protocol coverage must be 100%"; \
		exit 1; \
	fi

# Show coverage summary for each package
coverage-summary:
	@echo "=== Protocol Coverage ==="
	@go tool cover -func=protocol.out | grep total || echo "Run 'make coverage-lcov' first"
	@echo ""
	@echo "=== Server Coverage ==="
	@go tool cover -func=server.out | grep total || echo "Run 'make coverage-lcov' first"
	@echo ""
	@echo "=== Client Coverage ==="
	@go tool cover -func=client.out | grep total || echo "Run 'make coverage-lcov' first"

# Run fuzzing
fuzz:
	go test ./pkg/protocol -fuzz=FuzzDecodeFrame -fuzztime=5m

# Build server and client
build:
	@VERSION=$$(git describe --tags --always --dirty 2>/dev/null || echo "dev"); \
	echo "Building with version: $$VERSION"; \
	go build -ldflags="-X main.Version=$$VERSION" -o superchat-server ./cmd/server; \
	go build -ldflags="-X main.Version=$$VERSION" -o superchat ./cmd/client

# Run server
run-server:
	go run ./cmd/server

# Run client
run-client:
	go run ./cmd/client

# Run website dev server
run-website:
	cd website && npm run dev

# Docker commands
docker-build:
	@VERSION=$$(git describe --tags --always --dirty 2>/dev/null || echo "dev"); \
	echo "Building Docker image with version: $$VERSION"; \
	depot build --platform linux/amd64,linux/arm64 --build-arg VERSION=$$VERSION -t aeolun/superchat:latest --load .

docker-build-push:
	@VERSION=$$(git describe --tags --always --dirty 2>/dev/null || echo "dev"); \
	echo "Building and pushing Docker image with version: $$VERSION"; \
	depot build --platform linux/amd64,linux/arm64 --build-arg VERSION=$$VERSION -t aeolun/superchat:latest --push .

docker-run:
	docker run -d \
		--name superchat \
		-p 6465:6465 \
		-v superchat-data:/data \
		aeolun/superchat:latest

docker-push:
	@echo "Use 'make docker-build-push' instead - depot requires --push during build"
	@exit 1

docker-stop:
	docker stop superchat || true
	docker rm superchat || true

# Clean coverage files
clean:
	rm -f coverage.out coverage.html
	rm -f protocol.out protocol.lcov
	rm -f server.out server.lcov
	rm -f client.out client.lcov
	rm -f superchat-server superchat superchat-client
