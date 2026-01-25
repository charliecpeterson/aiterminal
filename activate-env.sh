#!/bin/bash
# Helper script to activate aiterminal-macos environment without nvm conflicts

echo "Deactivating any active conda environment..."
conda deactivate 2>/dev/null || true

echo "Temporarily disabling nvm for this session..."
export PATH=$(echo $PATH | sed 's|[^:]*\.nvm[^:]*:||g')

echo "Activating aiterminal-macos environment..."
conda activate aiterminal-macos

echo ""
echo "Environment activated!"
echo ""
echo "Verifying tools:"
echo "  node:  $(which node) -> $(node --version)"
echo "  npm:   $(which npm) -> $(npm --version)"
echo "  rustc: $(which rustc) -> $(rustc --version 2>&1 | head -1)"
echo ""
echo "You can now run:"
echo "  npm ci              # Install dependencies (first time)"
echo "  npm run tauri dev   # Start development server"
echo ""
