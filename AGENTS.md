# Repository Guidelines

## Project Structure & Module Organization
- `cmd/server` builds the `scd` daemon; `cmd/client` builds the TUI `sc` binary.
- Core logic lives under `pkg/` (`protocol`, `server`, `client`); unit tests sit beside the code they cover.
- API and design references are in `docs/` (see `PROTOCOL.md`, `DATA_MODEL.md`).
- Front-end assets for the marketing site live in `website/` (Vite project); Docker and deployment assets are at the repo root.

## Build, Test, and Development Commands
- `make build` compiles both client and server, embedding the current git version.
- `make run-server` / `make run-client` start the Go entry points without producing binaries.
- `make test` runs `go test ./... -race`; use `make coverage` for an aggregate report and `make coverage-protocol` to enforce 100% protocol coverage.
- `make run-website` runs `npm run dev` within `website/` for local site work; use `npm run build` there for production bundles.

## Coding Style & Naming Conventions
- Format Go code with `go fmt ./...` before committing; keep default tab indentation and place files in idiomatic lower-case package directories.
- Exported Go symbols need doc comments; tests belong in `*_test.go` and use descriptive `TestXxx` names.
- Client/server binaries should stay `sc` and `scd`; configuration samples live in `config.example.toml` and `client-config.example.toml` – mirror those naming patterns for new templates.

## Testing Guidelines
- Write table-driven Go tests where possible; mock network boundaries via the protocol package helpers.
- Keep `pkg/protocol` at 100% coverage (validated by `make coverage-protocol`); include benchmarks or fuzz targets when extending binary parsing.
- Name integration tests after the workflows they cover (e.g., `TestThreadLifecycle`); stash fixtures under the package directory.

## Commit & Pull Request Guidelines
- Follow Conventional Commit prefixes (`feat:`, `fix:`, `ci:`, etc.) as seen in recent history (`git log --oneline`).
- One functional change per commit; update docs (`README.md`, `docs/*`) alongside code.
- PRs should describe motivation, list testing commands executed (e.g., `make test`), link relevant issues, and add screenshots or terminal recordings for UX changes.
