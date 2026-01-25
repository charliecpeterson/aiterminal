# Quick Start - Environment Setup (macOS)

This is the fastest way to get AIterminal building on your Mac.

## One-Command Setup

```bash
conda env create -f environment-macos.yml
conda activate aiterminal-macos
npm ci
```

That's it! Now you can run:

```bash
npm run tauri dev
```

---

## What This Installs

From `environment-macos.yml`:
- **Node.js 20.19.6** (closest to your .nvmrc requirement of 20.19.0)
- **npm 10.x** (comes with Node.js)
- **Rust 1.92.0** (latest stable, compatible with Tauri 2)
- **cargo** (comes with Rust)
- **OpenSSL 3.6.0** (for HTTPS/TLS)
- **pkg-config, git, make** (build tools)
- **Python 3.14** (optional, for build scripts)

---

## Verify Installation

```bash
# Check versions
node --version     # v20.19.6
npm --version      # 10.x.x
rustc --version    # rustc 1.92.0
cargo --version    # cargo 1.92.0

# Test build
npm run build

# Test Rust compilation
cd src-tauri && cargo check
```

---

## Common Commands

```bash
# Activate environment (do this every time)
conda activate aiterminal-macos

# Development mode (hot reload)
npm run tauri dev

# Run tests
npm run test              # Frontend (Vitest)
npm run test:run          # Frontend (once)
cd src-tauri && cargo test  # Backend (Rust)

# Production build
npm run tauri build
# Output: src-tauri/target/release/bundle/macos/AIterminal.app
```

---

## Troubleshooting

### Problem: "node: command not found"
**Solution:** Activate the environment first
```bash
conda activate aiterminal-macos
```

### Problem: OpenSSL linking errors
**Solution:** Set environment variables
```bash
export OPENSSL_DIR=$CONDA_PREFIX
export OPENSSL_LIB_DIR=$CONDA_PREFIX/lib
export OPENSSL_INCLUDE_DIR=$CONDA_PREFIX/include
```

### Problem: "cargo: command not found"
**Solution:** Rust is installed but not in PATH
```bash
# Check if conda installed it
which rustc

# If not found, install via rustup instead
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### Problem: Build is slow
**Solution:** Enable incremental compilation
```bash
export CARGO_INCREMENTAL=1
```

---

## Update Environment

If you need to update packages:

```bash
conda deactivate
conda env update -f environment-macos.yml --prune
conda activate aiterminal-macos
```

---

## Remove Environment

If you need to start over:

```bash
conda deactivate
conda env remove -n aiterminal-macos
# Then recreate: conda env create -f environment-macos.yml
```

---

## Notes

- **Node.js version**: We use 20.19.6 (conda-forge doesn't have exactly 20.19.0, but 20.19.6 is compatible)
- **Rust version**: We use 1.92.0 (newer than 1.82 you had in mind, but fully compatible with Tauri 2)
- **Cargo**: Automatically included with Rust package, no separate installation needed
- **npm**: Automatically included with Node.js package, no separate installation needed
- **Xcode Tools**: Required by Tauri. If not installed: `xcode-select --install`

---

## Alternative: Use System Tools

If you prefer not to use conda for Rust (recommended by many):

1. Remove Rust from environment-macos.yml:
   ```yaml
   dependencies:
     - nodejs=20.19.*
     # Remove: - rust>=1.82
     - pkg-config
     # ... rest
   ```

2. Install Rust via rustup:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```

3. Create environment:
   ```bash
   conda env create -f environment-macos.yml
   conda activate aiterminal-macos
   npm ci
   ```

This gives you conda-managed Node.js but system-managed Rust (better toolchain management).

---

For full documentation, see `ENVIRONMENT_SETUP.md`
