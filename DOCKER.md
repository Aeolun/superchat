# Docker Deployment Guide

SuperChat server is available as a Docker image at `aeolun/superchat:latest`.

## Quick Start

### Using Docker Run

```bash
# Run the server
docker run -d \
  --name superchat \
  -p 6465:6465 \
  -v superchat-data:/data \
  aeolun/superchat:latest

# View logs
docker logs -f superchat

# Stop the server
docker stop superchat
```

### Using Docker Compose

```bash
docker-compose up -d
```

**Note:** SuperChat uses a custom binary TCP protocol (not HTTP), so port 6465 must be exposed directly. HTTP reverse proxies like Caddy/Nginx won't work without their TCP streaming modules.

Clients connect to: `superchat.win:6465` or `your-server-ip:6465`

## Configuration

The server auto-creates a default config at `/data/config.toml` on first run.

To customize the config:

1. Run the container once to generate the default config
2. Copy it out: `docker cp superchat:/data/config.toml ./config.toml`
3. Edit `config.toml`
4. Mount it back: `docker run -v ./config.toml:/data/config.toml ...`

Or create your own config and mount it:

```bash
docker run -d \
  --name superchat \
  -p 6465:6465 \
  -v superchat-data:/data \
  -v ./my-config.toml:/data/config.toml \
  aeolun/superchat:latest
```

## Data Persistence

All data is stored in `/data` inside the container:
- `/data/superchat.db` - SQLite database (messages, channels, sessions)
- `/data/config.toml` - Server configuration
- `/data/superchat.db-wal` - Write-Ahead Log (SQLite WAL mode)
- `/data/superchat.db-shm` - Shared memory file (SQLite WAL mode)

**Important:** Always use a named volume or bind mount for `/data` to persist data.

## Building the Image

From the project root:

```bash
# Build the image
make docker-build

# Or manually
docker build -t aeolun/superchat:latest .
```

## Publishing to Docker Hub

```bash
# Login (first time only)
docker login

# Build and push
make docker-build
make docker-push
```

## Image Details

- **Base Image:** Alpine Linux (minimal)
- **Size:** ~30MB
- **User:** Runs as non-root user `superchat` (UID 1000)
- **Port:** 6465 (TCP)
- **Volume:** `/data`

## Security

The container:
- Runs as non-root user (`superchat`)
- Uses Alpine Linux for minimal attack surface
- Only exposes port 6465
- All data isolated in `/data` volume

## Troubleshooting

### Check if container is running
```bash
docker ps | grep superchat
```

### View logs
```bash
docker logs superchat
docker logs -f superchat  # Follow logs
```

### Access container shell
```bash
docker exec -it superchat sh
```

### Inspect database
```bash
docker exec superchat ls -la /data
```

### Port already in use
If you get "address already in use", either:
1. Stop the conflicting service on port 6465
2. Use a different port: `-p 8070:6465`
