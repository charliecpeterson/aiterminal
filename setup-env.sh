#!/bin/bash
# AIterminal Environment Setup Script
# This script helps set up the development environment for building AIterminal

set -e  # Exit on error

echo "==================================================="
echo "AIterminal Development Environment Setup"
echo "==================================================="
echo ""

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     PLATFORM=Linux;;
    Darwin*)    PLATFORM=macOS;;
    CYGWIN*|MINGW*|MSYS*) PLATFORM=Windows;;
    *)          PLATFORM="UNKNOWN:${OS}"
esac

echo "Detected platform: ${PLATFORM}"
echo ""

# Check for conda
if ! command -v conda &> /dev/null; then
    echo "❌ Error: conda is not installed or not in PATH"
    echo "Please install Miniconda or Anaconda first:"
    echo "  https://docs.conda.io/en/latest/miniconda.html"
    exit 1
fi

echo "✓ Found conda: $(conda --version)"
echo ""

# Check for required system dependencies
echo "Checking system dependencies..."
echo ""

if [ "${PLATFORM}" = "macOS" ]; then
    echo "macOS detected - checking for Xcode Command Line Tools..."
    if xcode-select -p &> /dev/null; then
        echo "✓ Xcode Command Line Tools installed"
    else
        echo "❌ Xcode Command Line Tools not found"
        echo "Installing Xcode Command Line Tools..."
        xcode-select --install
        echo "Please complete the installation and run this script again."
        exit 1
    fi
elif [ "${PLATFORM}" = "Linux" ]; then
    echo "Linux detected - checking for required system packages..."
    
    MISSING_PACKAGES=""
    
    # Check for webkit2gtk
    if ! pkg-config --exists webkit2gtk-4.1; then
        MISSING_PACKAGES="${MISSING_PACKAGES} libwebkit2gtk-4.1-dev"
    fi
    
    # Check for essential build tools
    if ! command -v gcc &> /dev/null; then
        MISSING_PACKAGES="${MISSING_PACKAGES} build-essential"
    fi
    
    if [ -n "${MISSING_PACKAGES}" ]; then
        echo "❌ Missing system packages:${MISSING_PACKAGES}"
        echo ""
        echo "Please install them with:"
        echo ""
        if command -v apt-get &> /dev/null; then
            echo "  sudo apt-get install ${MISSING_PACKAGES} libssl-dev pkg-config"
        elif command -v dnf &> /dev/null; then
            echo "  sudo dnf install webkit2gtk4.1-devel openssl-devel pkg-config"
        else
            echo "  (Use your distribution's package manager)"
        fi
        echo ""
        exit 1
    else
        echo "✓ Required system packages found"
    fi
fi

echo ""
echo "==================================================="
echo "Creating conda environment..."
echo "==================================================="
echo ""

# Determine which environment file to use
if [ "${PLATFORM}" = "macOS" ]; then
    ENV_FILE="environment-macos.yml"
    ENV_NAME="aiterminal-macos"
elif [ "${PLATFORM}" = "Linux" ]; then
    ENV_FILE="environment-linux.yml"
    ENV_NAME="aiterminal-linux"
else
    echo "❌ Error: Windows is not yet supported by this setup script"
    echo "Please follow the manual setup instructions in ENVIRONMENT_SETUP.md"
    exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
    echo "❌ Error: ${ENV_FILE} not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check if environment already exists
if conda env list | grep -q "^${ENV_NAME} "; then
    echo "⚠️  Environment '${ENV_NAME}' already exists"
    read -p "Do you want to remove and recreate it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Removing existing environment..."
        conda env remove -n "${ENV_NAME}" -y
    else
        echo "Keeping existing environment. To update, run:"
        echo "  conda env update -f ${ENV_FILE}"
        exit 0
    fi
fi

# Create environment
echo "Creating environment from ${ENV_FILE}..."
conda env create -f "${ENV_FILE}"

echo ""
echo "✓ Environment created successfully"
echo ""

# Activate environment for remaining setup
echo "==================================================="
echo "Activating environment and installing dependencies"
echo "==================================================="
echo ""

# Source conda
eval "$(conda shell.bash hook)"
conda activate "${ENV_NAME}"

# Verify Node.js
echo "Verifying Node.js installation..."
node --version
npm --version

# Verify Rust
echo ""
echo "Verifying Rust installation..."
if command -v rustc &> /dev/null; then
    rustc --version
    cargo --version
    echo "✓ Rust toolchain ready"
else
    echo "⚠️  Rust not found in conda environment"
    echo "Installing Rust via rustup (recommended)..."
    
    if ! command -v rustup &> /dev/null; then
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    fi
    
    rustc --version
    cargo --version
fi

echo ""
echo "==================================================="
echo "Installing JavaScript dependencies"
echo "==================================================="
echo ""

npm ci

echo ""
echo "==================================================="
echo "Verifying Rust compilation"
echo "==================================================="
echo ""

cd src-tauri
cargo check --quiet || cargo check
cd ..

echo ""
echo "==================================================="
echo "✓ Setup complete!"
echo "==================================================="
echo ""
echo "Your development environment is ready!"
echo ""
echo "To get started:"
echo ""
echo "  1. Activate the environment:"
echo "     conda activate ${ENV_NAME}"
echo ""
echo "  2. Run the development server:"
echo "     npm run tauri dev"
echo ""
echo "  3. Run tests:"
echo "     npm run test              # Frontend tests"
echo "     npm run test:run          # Frontend tests (once)"
echo "     cd src-tauri && cargo test  # Backend tests"
echo ""
echo "  4. Build for production:"
echo "     npm run tauri build"
echo ""
echo "For more information, see:"
echo "  - README.md"
echo "  - AGENTS.md (development guidelines)"
echo "  - docs/ directory"
echo ""
