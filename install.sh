#!/bin/sh
# SuperChat installer script
# Usage: curl -fsSL https://raw.githubusercontent.com/aeolun/superchat/main/install.sh | sh
# Or:    curl -fsSL https://raw.githubusercontent.com/aeolun/superchat/main/install.sh | sudo sh -s -- --global

set -e

REPO="aeolun/superchat"
USE_SUDO=""
INSTALL_DIR_SET=""

# Check for --global flag
for arg in "$@"; do
    case "$arg" in
        --global)
            INSTALL_DIR="/usr/bin"
            USE_SUDO="sudo"
            INSTALL_DIR_SET="true"
            ;;
    esac
done

# Set default install directory if not already set
if [ -z "$INSTALL_DIR_SET" ]; then
    INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    printf "${GREEN}==>${NC} %s\n" "$1"
}

log_warn() {
    printf "${YELLOW}Warning:${NC} %s\n" "$1"
}

log_error() {
    printf "${RED}Error:${NC} %s\n" "$1" >&2
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux";;
        Darwin*)    echo "darwin";;
        FreeBSD*)   echo "freebsd";;
        MINGW*|MSYS*|CYGWIN*) echo "windows";;
        *)
            log_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac
}

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)   echo "amd64";;
        aarch64|arm64)  echo "arm64";;
        *)
            log_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac
}

# Get latest release tag
get_latest_release() {
    curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | \
        grep '"tag_name":' | \
        sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and install binary
install_binary() {
    local binary_type="$1"
    local binary_name="$2"
    local os="$3"
    local arch="$4"
    local version="$5"

    local download_name="superchat"
    if [ "$binary_type" = "server" ]; then
        download_name="superchat-server"
    fi
    download_name="${download_name}-${os}-${arch}"

    if [ "$os" = "windows" ]; then
        download_name="${download_name}.exe"
    fi

    local url="https://github.com/$REPO/releases/download/$version/$download_name"

    log_info "Downloading $binary_type from $url..."

    local tmp_file="/tmp/$download_name"
    if ! curl -fsSL -o "$tmp_file" "$url"; then
        log_error "Failed to download $binary_type binary"
        return 1
    fi

    log_info "Installing $binary_name to $INSTALL_DIR..."

    # Create install directory if it doesn't exist
    if [ -n "$USE_SUDO" ]; then
        $USE_SUDO mkdir -p "$INSTALL_DIR"
        $USE_SUDO mv "$tmp_file" "$INSTALL_DIR/$binary_name"
        $USE_SUDO chmod +x "$INSTALL_DIR/$binary_name"
    else
        mkdir -p "$INSTALL_DIR"
        mv "$tmp_file" "$INSTALL_DIR/$binary_name"
        chmod +x "$INSTALL_DIR/$binary_name"
    fi

    log_info "$binary_name installed successfully!"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Main installation
main() {
    log_info "SuperChat Installer"
    echo ""

    # Check dependencies
    if ! command_exists curl; then
        log_error "curl is required but not installed"
        exit 1
    fi

    # Show installation mode
    if [ -n "$USE_SUDO" ]; then
        log_info "Installing system-wide to $INSTALL_DIR (requires sudo)"
    else
        log_info "Installing to $INSTALL_DIR"
    fi
    echo ""

    # Detect system
    OS=$(detect_os)
    ARCH=$(detect_arch)
    log_info "Detected system: $OS $ARCH"

    # Get latest version
    log_info "Fetching latest release..."
    VERSION=$(get_latest_release)
    if [ -z "$VERSION" ]; then
        log_error "Failed to fetch latest release version"
        exit 1
    fi
    log_info "Latest version: $VERSION"
    echo ""

    # Install client
    install_binary "client" "sc" "$OS" "$ARCH" "$VERSION"
    echo ""

    # Install server
    install_binary "server" "scd" "$OS" "$ARCH" "$VERSION"
    echo ""

    # Check if install directory is in PATH
    case ":$PATH:" in
        *":$INSTALL_DIR:"*)
            log_info "Installation complete! ✓"
            ;;
        *)
            log_warn "Installation complete, but $INSTALL_DIR is not in your PATH"
            echo ""
            echo "Add it to your PATH by running:"
            echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
            echo ""
            echo "Or add this line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
            echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
            ;;
    esac

    echo ""
    log_info "Usage:"
    echo "  sc                    # Connect to default server (superchat.win)"
    echo "  sc --server HOST:PORT # Connect to custom server"
    echo "  scd                   # Run your own server"
}

main "$@"
