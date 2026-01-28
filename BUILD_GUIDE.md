# AIterminal Build Guide

Complete guide for building AIterminal for macOS (and other platforms).

---

## Quick Start

### Build for Development
```bash
npm run tauri dev
```

### Build Production App/DMG
```bash
npm run tauri build
```

The built app will be in: `src-tauri/target/release/bundle/`

---

## Prerequisites

### Required Software
- **Rust & Cargo** - Latest stable version
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

- **Node.js** - Version 20.19.0+ or 22.12.0+
  ```bash
  # Using nvm (recommended)
  nvm install 22
  nvm use 22
  ```

- **Xcode Command Line Tools** (macOS only)
  ```bash
  xcode-select --install
  ```

### Verify Installation
```bash
# Check versions
rustc --version    # Should be 1.70.0+
cargo --version
node --version     # Should be 20.19.0+ or 22.12.0+
npm --version
```

---

## Build Process

### 1. Install Dependencies
```bash
npm ci
```
*Note: Use `npm ci` instead of `npm install` for reproducible builds*

### 2. Development Build
```bash
npm run tauri dev
```
This will:
- Start Vite dev server on http://localhost:1420
- Compile Rust backend
- Launch the app with hot-reload enabled

### 3. Production Build
```bash
npm run tauri build
```
This will:
- Run `npm run build` (TypeScript + Vite production build)
- Compile Rust in release mode
- Create platform-specific bundles

---

## macOS Build Outputs

After running `npm run tauri build`, you'll find:

### App Bundle
```
src-tauri/target/release/bundle/macos/AITerminal.app
```
- Standalone .app you can drag to /Applications
- Double-click to run

### DMG Installer
```
src-tauri/target/release/bundle/dmg/AITerminal_0.1.0_x64.dmg
```
- Distributable installer for macOS
- User can drag to Applications folder
- Includes proper code signing (if configured)

### Universal Binary (Apple Silicon + Intel)
To build a universal binary:
```bash
rustup target add aarch64-apple-darwin
rustup target add x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

---

## Build Configuration

### tauri.conf.json
Located at `src-tauri/tauri.conf.json`:

```json
{
  "productName": "AITerminal",
  "version": "0.1.0",
  "identifier": "com.charlie.aiterminal",
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "10.13",
      "hardenedRuntime": true
    }
  }
}
```

### Key Settings
- **productName**: App display name
- **version**: Semantic version (update before releases)
- **identifier**: Unique bundle ID (reverse domain)
- **minimumSystemVersion**: Minimum macOS version (10.13 = High Sierra)
- **hardenedRuntime**: Enable macOS security features

---

## Code Signing (Optional but Recommended)

### Without Code Signing
The app will work but show "unidentified developer" warning.

### With Code Signing
1. **Get Apple Developer Certificate**
   - Join Apple Developer Program ($99/year)
   - Create Developer ID Application certificate in Xcode

2. **Configure Tauri**
   Edit `src-tauri/tauri.conf.json`:
   ```json
   "macOS": {
     "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
     "providerShortName": "YOUR_TEAM_ID"
   }
   ```

3. **Build with Signing**
   ```bash
   npm run tauri build
   ```
   Tauri will automatically sign the app during build.

4. **Notarize (for Distribution)**
   ```bash
   # After building
   xcrun notarytool submit \
     src-tauri/target/release/bundle/dmg/AITerminal_0.1.0_x64.dmg \
     --apple-id your@email.com \
     --team-id YOUR_TEAM_ID \
     --password APP_SPECIFIC_PASSWORD \
     --wait
   ```

---

## Build Flags & Options

### Debug vs Release
```bash
# Debug build (faster compilation, larger binary, includes debug symbols)
npm run tauri build -- --debug

# Release build (slower compilation, optimized, smaller binary)
npm run tauri build
```

### Specific Targets
```bash
# macOS only
npm run tauri build -- --target aarch64-apple-darwin

# Build specific bundle type
npm run tauri build -- --bundles dmg
npm run tauri build -- --bundles app
```

### Skip Bundle Creation
```bash
# Just build the binary, skip packaging
npm run tauri build -- --no-bundle
```

---

## Build Troubleshooting

### "Command not found: tauri"
```bash
npm install
# or
npm ci
```

### "Rust compiler not found"
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### "Node version too old"
```bash
nvm install 22
nvm use 22
# or update .nvmrc and run:
nvm use
```

### Build Fails with "disk full"
Rust can use a lot of disk space. Clean build artifacts:
```bash
cd src-tauri
cargo clean
cd ..
npm run tauri build
```

### macOS Gatekeeper Blocks App
```bash
# Remove quarantine attribute
xattr -cr /path/to/AITerminal.app
```

---

## Distribution

### For Testing
1. Build the app: `npm run tauri build`
2. Share the DMG file: `src-tauri/target/release/bundle/dmg/AITerminal_0.1.0_x64.dmg`
3. Users can download and install

### For Public Release
1. **Code sign** the app (see Code Signing section)
2. **Notarize** with Apple (required for macOS 10.15+)
3. **Create GitHub Release** with DMG attached
4. **Update app** with new version number in `tauri.conf.json`

---

## Performance Optimization

### Reduce Bundle Size
```bash
# Strip debug symbols (already done in release builds)
strip src-tauri/target/release/aiterminal

# Optimize Rust dependencies
# Add to src-tauri/Cargo.toml:
[profile.release]
opt-level = "z"     # Optimize for size
lto = true          # Link-time optimization
codegen-units = 1   # Single codegen unit
strip = true        # Strip symbols
```

### Faster Development Builds
```bash
# Use faster linker (install first)
brew install michaeleisel/zld/zld

# Add to src-tauri/.cargo/config.toml:
[target.x86_64-apple-darwin]
rustflags = ["-C", "link-arg=-fuse-ld=/opt/homebrew/bin/zld"]
```

---

## CI/CD Build

### GitHub Actions Example
```yaml
name: Build
on: [push, pull_request]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        
      - name: Install dependencies
        run: npm ci
        
      - name: Build app
        run: npm run tauri build
        
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: macos-dmg
          path: src-tauri/target/release/bundle/dmg/*.dmg
```

---

## Shell Integration PATH Fix

### Issue
When opening a new tab in AIterminal, the PATH may be missing system directories compared to macOS Terminal.app, such as:
- `/usr/local/bin`
- `/System/Cryptexes/App/usr/bin`
- Various system cryptex paths
- `/opt/X11/bin`
- `/Library/Apple/usr/bin`

### Root Cause
AIterminal uses `bash --rcfile` (non-login shell) instead of `bash -l` (login shell) to enable shell integration. Login shells automatically source `/etc/profile` which sets up the system PATH on macOS.

### Fix (Already Applied)
The fix has been applied to `src-tauri/shell-integration/bash_init.sh`:
- Now sources `/etc/profile` before user rc files
- This matches the behavior of login shells
- Ensures system PATH is properly initialized

### Verification
After rebuilding and opening a new tab:
```bash
echo $PATH
```
Should now include all system paths like macOS Terminal.app.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm ci` | Install dependencies |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build frontend only |
| `npm run tauri dev` | Run app in development mode |
| `npm run tauri build` | Build production app/DMG |
| `npm run test` | Run tests |
| `cargo clean` | Clean Rust build cache |

---

## Additional Resources

- **Tauri Documentation**: https://tauri.app/v2/guide/
- **Tauri Build Guide**: https://tauri.app/v2/guide/building/
- **macOS Signing**: https://tauri.app/v2/guide/distribution/sign-macos/
- **Rust Book**: https://doc.rust-lang.org/book/
- **Vite Documentation**: https://vitejs.dev/

---

## Support

For build issues:
1. Check the troubleshooting section above
2. Search GitHub issues
3. Review Tauri documentation
4. Check system requirements

Happy building! 🚀
