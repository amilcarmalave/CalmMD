# Third-party licenses

Runtime dependencies shipped with CalmMD. Only permissive licenses are allowed.

| Package | License | Use |
|---|---|---|
| Tauri 2 (`tauri`, `@tauri-apps/api`, `tauri-plugin-dialog`) | MIT / Apache-2.0 | Desktop shell |
| CodeMirror 6 (`@codemirror/*`, `@lezer/*`) | MIT | Editor |
| Solid (`solid-js`) | MIT | UI layer |
| markdown-it, markdown-it-footnote | MIT | Markdown rendering |
| DOMPurify | Apache-2.0 (dual-licensed with MPL-2.0; used under Apache-2.0) | HTML sanitising |
| `tauri-plugin-opener`, `@tauri-apps/plugin-opener` | MIT / Apache-2.0 | Opening links in the browser |
| `tauri-plugin-clipboard-manager`, `@tauri-apps/plugin-clipboard-manager` | MIT / Apache-2.0 | Clipboard for context-menu Cut/Copy/Paste |
| `@codemirror/autocomplete` | MIT | Slash-command menu |
| `tauri-plugin-single-instance` | MIT / Apache-2.0 | Opening files in the running app |
| serde, serde_json | MIT / Apache-2.0 | Rust serialisation |
| trash | MIT | Moving files to the OS trash |
| Paged.js (`pagedjs`) | MIT | PDF pagination (inlined into PDF exports) |
| KaTeX (`katex`) | MIT | Math rendering (fonts: SIL OFL 1.1 / MIT as shipped by KaTeX) |
| Mermaid (`mermaid`) and its bundled dependencies (d3, dagre-d3-es, cytoscape, khroma, …) | MIT / BSD-3 / ISC | Diagrams (lazy-loaded) |
| markdown-it-mark, markdown-it-sub, markdown-it-sup | MIT | `==highlight==`, `~sub~`, `^sup^` |
| base64 | MIT / Apache-2.0 | Embedding images, decoding PDFs |
| tungstenite | MIT / Apache-2.0 | DevTools-protocol connection to the PDF engine |
| Inter (`@fontsource-variable/inter`) | SIL OFL 1.1 | UI and sans font |
| Literata (`@fontsource-variable/literata`) | SIL OFL 1.1 | Serif reading font |
| JetBrains Mono (`@fontsource-variable/jetbrains-mono`) | SIL OFL 1.1 | Code and source font |

**Excluded on purpose:** `elkjs` (EPL-2.0 OR GPL-3.0), which Mermaid uses only for the opt-in
`layout: elk` mode. It's aliased to a stub (`src/render/elk-stub.ts`) so no non-permissive code ships.

Dev-only tooling (Vite, Vitest, TypeScript, jsdom, tempfile) is not distributed.
