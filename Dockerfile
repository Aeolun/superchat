# Build stage
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git make

# Set working directory
WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build argument for version (passed from build command)
ARG VERSION=dev

# Build the server binary with version
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-X main.Version=${VERSION}" -o superchat-server ./cmd/server

# Final stage - minimal image
FROM alpine:latest

# Add ca-certificates for HTTPS (if needed in future)
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN addgroup -g 1000 superchat && \
    adduser -D -u 1000 -G superchat superchat

# Create data directory
RUN mkdir -p /data && \
    chown superchat:superchat /data

# Copy binary from builder
COPY --from=builder /build/superchat-server /usr/local/bin/superchat-server
RUN chmod +x /usr/local/bin/superchat-server

# Switch to non-root user
USER superchat

# Set working directory
WORKDIR /data

# Expose port
EXPOSE 6465

# Volume for persistent data
VOLUME ["/data"]

# Default command
CMD ["superchat-server", "--db", "/data/superchat.db", "--config", "/data/config.toml"]
