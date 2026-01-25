# Development Environment Setup Guide

This guide helps you set up the development environment for building AIterminal.

## Quick Start (Recommended)

### Option 1: Automated Setup Script

```bash
# Run the setup script (macOS/Linux)
./setup-env.sh
```

This script will:
- Verify system dependencies
- Create a conda environment
- Install all required packages
- Verify the installation

### Option 2: Manual Conda Setup

```bash
# For macOS users
conda env create -f environment-macos.yml
conda activate aiterminal-macos

# For Linux users
conda env create -f environment-linux.yml
conda activate aiterminal-linux

# For all platforms (generic, uses system packages for platform-specific needs)
conda env create -f environment.yml
conda activate aiterminal

# Install JavaScript dependencies
npm ci

# Verify Rust compilation
cd src-tauri && cargo check
```

---

## Prerequisites

### All Platforms
- **Conda/Miniconda** - Package manager
  - Download: https://docs.conda.io/en/latest/miniconda.html
  - Verify: `conda --version`

### macOS
- **Xcode Command Line Tools** (required by Tauri)
  ```bash
  xcode-select --install
  ```

### Linux (Debian/Ubuntu)
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### Linux (Fedora/RHEL)
```bash
sudo dnf install \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

### Windows
- **Visual Studio C++ Build Tools**
  - Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/
- **WebView2** (usually pre-installed on Windows 11)

---

## Environment Files

### environment-macos.yml (macOS only - Recommended)
Minimal, optimized for macOS development:
- Node.js 20.19.x (latest available in conda-forge)
- Rust 1.82+ (latest stable)
- Essential build tools

**Usage:**
```bash
conda env create -f environment-macos.yml
conda activate aiterminal-macos
```

### environment-linux.yml (Linux only)
Linux-specific environment with system libraries:
- Node.js 20.19.x
- Rust 1.82+
- GTK3, Cairo, Pango (for Tauri)
- Build tools (gcc, g++)

**Usage:**
```bash
conda env create -f environment-linux.yml
conda activate aiterminal-linux
```

### environment.yml (Cross-platform - Generic)
Generic environment for all platforms (requires system packages for Linux):
- Node.js 20.19.x
- Rust 1.82+
- Basic build tools

**Usage:**
```bash
conda env create -f environment.yml
conda activate aiterminal
```

---

## Verification

After setup, verify your environment:

```bash
# Activate environment
conda activate aiterminal-macos  # or aiterminal-linux, or aiterminal

# Check versions
node --version     # Should be v20.19.x
npm --version      # Should be 10.x.x+
rustc --version    # Should be 1.82.0+
cargo --version    # Should be 1.82.0+

# Build frontend
npm run build

# Test Rust compilation
cd src-tauri && cargo check

# Run development mode
npm run tauri dev
```

---

## Development Workflow

### Daily Development

```bash
# Daily development
conda activate aiterminal-macos  # or aiterminal-linux
npm run tauri dev
```

### Testing

```bash
# Frontend tests (watch mode)
npm run test

# Frontend tests (run once)
npm run test:run

# Backend tests
cd src-tauri && cargo test
```

### Production Build

```bash
# Build complete application
npm run tauri build

# Output location (macOS):
# src-tauri/target/release/bundle/macos/AIterminal.app

# Output location (Linux):
# src-tauri/target/release/bundle/appimage/aiterminal_*.AppImage

# Output location (Windows):
# src-tauri/target/release/bundle/msi/AIterminal_*.msi
```

---

## Technology Stack

### Frontend
- **React 19.1.0** - UI framework
- **TypeScript 5.8.3** - Type-safe JavaScript
- **Vite 7.3.0** - Build tool & dev server
- **xterm.js 5.5.0** - Terminal emulator
- **Vitest 4.0.16** - Testing framework

### Backend
- **Rust 1.82.0** - Systems programming language
- **Tauri 2.0** - Desktop app framework
- **tokio** - Async runtime
- **portable-pty** - PTY handling
- **reqwest** - HTTP client

### Key Dependencies
- **Node.js 20.19.0 LTS** - JavaScript runtime
- **npm 10+** - Package manager
- **OpenSSL 3.0+** - Cryptography
- **WebKit** (macOS) / **WebKit2GTK** (Linux) - Web rendering

---

## Troubleshooting

### OpenSSL Errors (Linux/macOS)
```bash
export OPENSSL_DIR=$CONDA_PREFIX
export OPENSSL_LIB_DIR=$CONDA_PREFIX/lib
export OPENSSL_INCLUDE_DIR=$CONDA_PREFIX/include
```

### Rust Not Found
```bash
# Option 1: Install via conda
conda install -c conda-forge rust cargo

# Option 2: Install via rustup (recommended)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### WebKit Errors (Linux)
```bash
# Debian/Ubuntu
sudo apt-get install libwebkit2gtk-4.1-dev

# Fedora/RHEL
sudo dnf install webkit2gtk4.1-devel
```

### Node Version Mismatch
```bash
# Ensure you're using Node 20.19.0
node --version

# If wrong version, recreate environment
conda deactivate
conda env remove -n aiterminal
conda env create -f environment-macos.yml
```

### Build Failures
```bash
# Clean build artifacts
npm run build -- --clean
cd src-tauri && cargo clean

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm ci

cd src-tauri && cargo clean
cargo build
```

---

## Alternative: Using System Tools

If you prefer system-installed tools instead of conda:

### Install Node.js (via nvm)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 20.19.0
nvm use 20.19.0
```

### Install Rust (via rustup)
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### Then install project dependencies
```bash
npm ci
cd src-tauri && cargo check
```

---

## Performance Tips

### Faster Rust Builds
```bash
# Enable incremental compilation
export CARGO_INCREMENTAL=1

# Use sccache for build caching (optional)
cargo install sccache
export RUSTC_WRAPPER=sccache

# Use LLD linker (Linux, optional)
sudo apt-get install lld
export RUSTFLAGS="-C link-arg=-fuse-ld=lld"
```

### Faster npm Installs
```bash
# Use npm ci instead of npm install (reads package-lock.json)
npm ci

# Clear cache if needed
npm cache clean --force
```

---

## Environment Management

### List Environments
```bash
conda env list
```

### Update Environment
```bash
conda env update -f environment-macos.yml
```

### Remove Environment
```bash
conda deactivate
conda env remove -n aiterminal
```

### Export Environment
```bash
conda env export > environment-backup.yml
```

---

## Additional Resources

- **Project Documentation**: See `docs/` directory
- **Development Guidelines**: See `AGENTS.md`
- **Security Fixes**: See `SECURITY_FIXES_DAY1.md`, `SECURITY_FIXES_DAY2-3.md`
- **Tauri Documentation**: https://tauri.app/
- **Rust Documentation**: https://doc.rust-lang.org/
- **React Documentation**: https://react.dev/

---

## Support

If you encounter issues not covered here:

1. Check the project's GitHub issues
2. Review Tauri platform-specific guides: https://tauri.app/start/prerequisites/
3. Verify all prerequisites are installed
4. Try recreating the conda environment
5. Check system logs for detailed error messages

---

## Minimum System Requirements

- **macOS**: 10.15 (Catalina) or later
- **Linux**: Ubuntu 20.04+, Fedora 36+, or equivalent
- **Windows**: Windows 10 version 1809 or later
- **RAM**: 4GB minimum, 8GB recommended
- **Disk Space**: 2GB for dependencies, 500MB for builds
- **Internet**: Required for initial setup and dependency downloads
