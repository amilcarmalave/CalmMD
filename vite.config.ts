import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

function appCsp(): string {
  const conf = JSON.parse(readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  return conf.app.security.csp as string;
}

/**
 * Dev-only: POST /__calmmd/save?name=x.html writes the body to $CALMMD_DEBUG_DIR. Used to capture
 * exports built in the browser dev build (with a real DOM, so Mermaid works) and print them with the
 * real PDF engine. Disabled unless the variable is set.
 */
function debugSave(dir: string | undefined): Plugin | null {
  if (!dir) return null;
  return {
    name: 'calmmd-debug-save',
    configureServer(server) {
      server.middlewares.use('/__calmmd/save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !/^[\w.-]+$/.test(name)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          writeFileSync(join(dir, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

// Tauri expects a fixed dev port and leaves the terminal output alone.
const host = process.env.TAURI_DEV_HOST;

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [solid(), debugSave(process.env.CALMMD_DEBUG_DIR)],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    // Keep elkjs (EPL-2.0/GPL-3.0, used only by Mermaid's opt-in ELK layout) out of the app.
    alias: { 'elkjs/lib/elk.bundled.js': fileURLToPath(new URL('./src/render/elk-stub.ts', import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // `npm run preview` serves the production build with the app's real CSP (read from tauri.conf.json),
  // so anything the CSP would break shows up in a browser before it ships.
  preview: {
    port: 4173,
    strictPort: true,
    headers: { 'Content-Security-Policy': appCsp() },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 (Chromium) on Windows, WKWebView on macOS 11+, WebKitGTK on Linux.
    target: ['es2021', 'chrome105', 'safari15'],
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Loaded from disk, not the network, so a large editor chunk is fine.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
