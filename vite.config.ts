import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Optimize bundle splitting
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split React and core deps into vendor chunk
          'vendor-react': ['react', 'react-dom'],
          
          // Split heavy markdown/rendering deps into separate chunks
          'vendor-markdown': [
            'react-markdown',
            'remark-gfm',
            'remark-math',
            'rehype-katex',
          ],
          
          // KaTeX is huge (4MB) - separate chunk
          'vendor-katex': ['katex'],
          
          // Document processing - only loaded for PreviewWindow
          'vendor-docs': [
            'mammoth',
            'js-yaml',
          ],
          
          // AI SDK - separate chunk
          'vendor-ai': [
            'ai',
            '@ai-sdk/openai',
            'zod',
          ],
          
          // Terminal deps
          'vendor-terminal': [
            '@xterm/xterm',
            '@xterm/addon-fit',
            '@xterm/addon-search',
            '@xterm/addon-web-links',
            '@xterm/addon-webgl',
          ],
          
          // Tauri API
          'vendor-tauri': [
            '@tauri-apps/api',
            '@tauri-apps/plugin-clipboard-manager',
            '@tauri-apps/plugin-dialog',
            '@tauri-apps/plugin-fs',
            '@tauri-apps/plugin-opener',
          ],
        },
      },
    },
    // Increase chunk size warning limit since we're splitting properly
    chunkSizeWarningLimit: 600,
    // Exclude unnecessary assets from build
    assetsInlineLimit: 4096, // Inline small assets
  },

  // Optimize CSS handling
  css: {
    preprocessorOptions: {
      // Note: KaTeX fonts are already optimized by only using woff2 in modern builds
    }
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
