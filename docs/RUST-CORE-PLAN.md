# Rust core plan: Mordant, zspell, Takumi and ikat inside Tauri

This is an implementation plan for moving CalmMD's heavy document processing into Rust **without
replacing Tauri**. The Solid/CodeMirror UI stays the shell; Rust gains authoritative services for
Markdown parsing/rendering, syntax highlighting, spellchecking and PDF production. Takumi is the
LaTeX-free, CSS-compatible PDF path; ikat is an optional typeset engine. The existing
MCP server can then call those services directly instead of round-tripping through the webview.

See [`MCP.md`](MCP.md) for the current MCP implementation and [`ARCHITECTURE.md`](ARCHITECTURE.md)
for the present TypeScript-centric architecture.

---

## 1. Goal

Move the parts of CalmMD that are expensive, CPU-bound or duplicated between preview and export into
Rust, while preserving the current:

- Tauri windowing and OS integration;
- Solid + CodeMirror editor and UI;
- local/privacy posture: no account, no cloud, no built-in LLM;
- opt-in loopback MCP server;
- file format: plain Markdown plus front matter.

The first milestone is **not** a GPUI migration. Rust becomes a service layer behind Tauri commands.

## Implementation status

- **Phase 0 — done:** frozen Markdown fixture corpus, TypeScript renderer and export-body baseline
  snapshots, and feature flags are in place.
- **Phase 1 — first slice landed:** Mordant parses front matter, headings and a top-level source map;
  Mordant renders HTML, highlights standalone code, and supports the corpus extensions (source-line
  attributes, wiki links, mark/sub/sup, callouts, tasks, front matter, math and preview-style
  footnotes). A Rust test compares the normalised corpus output with the frozen TypeScript
  snapshot, covering source-line anchors used by scroll sync. Commands `markdown_parse`,
  `markdown_render` and `markdown_highlight_code` are exposed through the TypeScript platform layer.
- **Phase 2 — first slice landed:** all 15 CalmMD syntax palettes are registered as custom Mordant
  themes in `core/highlight`. Rust highlighting resolves CalmMD colour/preview theme ids to those
  themes; export and preview pass the active colour theme through `MarkdownRenderOptions.theme`.
- **Phase 1/4 accepted:** Mordant's HTML matches the frozen extension corpus snapshot, and a
  500-line mixed fixture produces exactly the same `data-line-start`/`data-line-end` anchors as the
  TypeScript renderer. The scroll-map round trip stays within 0.03 lines on that fixture.
  `createRustRenderer()` is now the default; it keeps DOMPurify, the patcher, relative
  image/embed handling, Mermaid and page breaks in the webview. Set
  `VITE_CALMMD_RUST_MARKDOWN=0` or `localStorage['calmmd.rust.markdown'] = '0'` to use the old path.
- **Phase 3 — bundled languages accepted:** zspell provides misspelling ranges, suggestions and a
  local personal word list. English (US/UK), German, French and Spanish are bundled and work offline.
  Italian, Portuguese, Dutch/Flemish, Finnish, Norwegian, Danish, Polish, Chinese, Japanese, Korean,
  Russian, Turkish and the other English variants appear under a separator in the same
  Spelling Language menu with a ↓ marker and download on request. A downloaded dictionary moves
  into the available (●) group. The OS checker remains the fallback for other languages and when
  `useRustSpell()` is disabled explicitly.
- **Phase 4 — first slice landed:** `buildBody()` can use the Rust `markdown_render` service when
  `useRustMarkdown()` is enabled. TOC, cover, image embedding and print post-processing still run in
  TypeScript, so parity is checked against the new baseline snapshots before switching defaults.
- **Phase 5a — shipped as the default PDF engine:** desktop PDF exports call
  `core/export/takumi.rs`, which parses the existing self-contained HTML, loads its embedded fonts
  and writes a paged vector PDF. The browser build uses the equivalent local WASM engine.
  `pdfEngine()` selects `takumi` (default), `browser` (explicit fallback) or `ikat` (not implemented).
- **Phase 5a visual review — passed:** the realistic smoke document was rendered by
  both engines in standard, report, academic, minimal and cover variants. Page counts match, TOC
  page numbers resolve, headers/footers and running bands align, embedded SVG text renders, task
  checkboxes and section numbering survive, and selected text/link annotations work. Residual
  differences are font rasterisation and small colour/placement variations. The review accepted those
  differences and made Takumi the default; side-by-side screenshots remain in
  [`docs/visual-reviews/takumi`](visual-reviews/takumi/README.md).
- **Font weight control:** Takumi reads CSS `font-weight` and `font-variation-settings: "wght" ...`,
  plus `@font-face` weight descriptors and `font-synthesis`. CalmMD exposes a reversible body-text
  weight through `VITE_CALMMD_TAKUMI_FONT_WEIGHT` or `localStorage['calmmd.takumi.fontWeight']`
  (default `350`); headings keep their explicit CSS weights. Native and WASM PDF exports inject the
  same CSS, and native form controls are replaced with flow-positioned SVG checkbox marks.
- **Phase 6 — in progress:** a Rust workspace owns the rooted path sandbox, live buffer mirror,
  file operations, history snapshots and link-safe rename/move. MCP calls those services directly
  for status, list, read, outline, search, create, write, rename, move, trash and triage; webview
  state-change events update the editor and explorer. A Rust buffer service now owns durable draft
  records and the autosave decision: write to disk, or keep unsaved text safe in a draft when a file
  changed underneath CalmMD. Rust also owns validated session and Space records (`core/session.rs`),
  including tabs, cursors, scroll lines, roots and sidebar layout. Autosave scheduling now lives in
  `core/autosave.rs`: the webview reports edits, and Rust owns debounce/max-wait, retries and status
  events. The webview still owns EditorState and undo history.
  PDF/HTML export still uses the webview bridge because the renderer is there.
- **Phases 5b and 7:** not started.

---

## 2. Selected dependencies

| Need | Choice | Why | License |
|---|---|---|---|
| Markdown parse/render/AST | `mordant` 0.10.1 | CommonMark 0.31.2 + GFM, full AST, HTML renderer, features for front matter/footnotes/math/diagrams/highlighter | MIT |
| Fenced-code highlighting | `mordant` `highlighter` feature | 190+ languages via syntect; VSCode/Sublime themes; standalone `Highlighter` API | MIT (+ transitive syntect deps) |
| Spellchecking | `zspell` 0.5.5 | Native Rust, Hunspell-compatible, `check_indices()` gives byte offsets; no OS dependency | Apache-2.0 |
| CSS-based PDF export | `takumi` / `takumi-pdf` | Rust HTML/CSS layout → paged PDF without a browser; closest LaTeX-free replacement for Paged.js | MIT OR Apache-2.0 |
| Typeset PDF export | `ikat` 0.13.6 | Rust Markdown → LaTeX → PDF pipeline; Mermaid→TikZ, pgfplots, templates; no browser/Paged.js | MIT OR Apache-2.0 |

`takumi` crate 2.20.0 requires Rust 1.91, so CalmMD's MSRV was raised to 1.91. Desktop exports use
the native `takumi-core`/`takumi-pdf` crates; the browser/WASM package is the equivalent engine for
the non-Tauri app and tests. The visual review accepted Takumi as the default PDF engine.

Not chosen yet:

- Vivliostyle.js — conceptually close to Paged.js, but AGPL-3.0 and browser-based; incompatible with
  the project's permissive dependency policy.
- `spellbook` (Helix) — good API and fast, but MPL-2.0 is not in the permissive allow-list in
  `CONTRIBUTING.md`. Revisit only if the licence policy is relaxed.
- OS spellchecker (`windows` crate / NSSpellChecker) — remains the fallback until zspell dictionaries
  are bundled for all supported platforms.

Record every runtime dependency and version in `THIRD_PARTY_LICENSES.md`.

---

## 3. Important reality checks

### 3.1 Mordant is not a UI renderer

Mordant parses Markdown, exposes an AST, renders HTML and highlights code. It does **not** paint
GPUI or DOM elements. With Tauri kept, the webview still paints the preview.

Two preview strategies exist:

- **Phase 1 (recommended):** Rust renders HTML with Mordant; the webview keeps DOMPurity sanitisation
  and the existing DOM patcher.
- **Phase 2 (optional):** walk Mordant's AST in Rust and emit a semantic block JSON that the webview
  renders into Solid components. This avoids HTML round-trips but is a larger rewrite.

Phase 1 gives the biggest win with the least risk.

### 3.2 Source-line mapping is critical

CalmMD's scroll sync depends on `data-line-start` attributes produced by the current renderer.
Mordant's AST must be checked for source spans. If spans are not exposed directly, add a small
source-map pass that associates top-level AST nodes with line numbers before rendering.

Acceptance criterion: split-view scroll sync stays within 0.03 lines in the existing 500-line test.

### 3.3 Takumi is the comparable LaTeX-free PDF engine; ikat is a different style

The current PDF path uses Paged.js + CSS templates (Standard, Report, Academic, Minimal) in a
Chromium engine. For a LaTeX-free, browser-free engine that still consumes HTML/CSS, **Takumi** is
the closest match: it supports paged layout, page breaks, running headers/footers, page numbers,
repeat table headers, selectable text and font embedding.

ikat instead produces camera-ready LaTeX/TikZ output. It is not a drop-in for the current CSS
designs, but is attractive as a separate high-end typesetting engine.

Plan: add `prefs.pdf.engine` with these values:

- `takumi` — default CSS-compatible, LaTeX-free, browser-free engine;
- `browser` — explicit Paged.js/Chromium fallback;
- `ikat` — optional LaTeX/TikZ engine.

The visual review accepted Takumi as the default; the browser engine remains available for exact CSS
comparisons and as an escape hatch.

### 3.4 zspell needs dictionaries and UTF-16 conversion

`zspell::check_indices()` returns byte offsets. CodeMirror uses UTF-16 code-unit offsets. The Rust
service must convert `(byte_start, byte_end)` to `(u32, u32)` UTF-16 ranges exactly as
`src-tauri/src/spell.rs` does today.

zspell suggestions are behind `unstable-suggestions`. The first implementation enables that feature
and caps results at six suggestions; the OS checker stays available as a fallback for languages we
do not bundle. Revisit if the suggestion algorithm's cost becomes noticeable.

---

## 4. Target architecture

```text
Solid / CodeMirror UI
  │  Tauri commands + events (typed DTOs)
  ▼
Rust core services                  src-tauri/src/core/
  markdown/   Mordant parse, AST, HTML, headings, source map
  highlight/  Mordant/syntect highlighter themes generated from CalmMD's CSS palette
  spell/      zspell dictionaries, UTF-16 ranges, learns
  export/     HTML via markdown, PDF via browser/Takumi/ikat
  workspace/  rooted live buffers, history, links and file operations (Phase 6 first slice)
  docs/       drafts, conflicts and autosave targets (still in the webview)
  explorer/   tree UI state (still in the webview)
  mcp/        calls core services directly except for PDF/HTML export
  ▼
Disk / app data
```

The webview remains authoritative for UI state until the relevant Rust service exists. During
migration, a Tauri command may delegate to Rust for one concern and still to the webview for another.

---

## 5. Proposed module layout

```text
src-tauri/src/
  core/
    mod.rs
    dto.rs            // shared serde DTOs used by commands and MCP
    markdown/
      mod.rs
      parse.rs        // parse_document, headings, front matter
      render.rs       // Mordant HTML with data-line-start + ids
      sourcemap.rs    // AST node → source line/range
      extensions.rs   // wiki links, callouts, tasks, attributes
      tests/
    highlight/
      mod.rs          // Mordant Highlighter wrapper, theme cache
    spell/
      mod.rs          // public spell_check / spell_check_text / spell_learn
      dictionary.rs   // zspell builder, bundled .aff/.dic, personal words
      utf16.rs        // byte offsets → UTF-16 ranges
    export/
      mod.rs
      html.rs         // Mordant HTML + standalone document shell
      pdf_browser.rs  // existing Paged.js/Chromium path
      pdf_ikat.rs     // ikat weaver + TeX engine driver
      prefs.rs        // convert ExportPrefs to ikat BuildSpec
  mcp/                // existing; later uses core services directly
```

TS side:

```text
src/core/
  markdownService.ts   // client for Rust render/parse commands
  spellService.ts      // client for Rust spell commands
src/platform/types.ts  // new command declarations
```

Keep the old TS implementation during feature-flagged rollout; delete only after parity.

---

## 6. Phased implementation

### Phase 0 — Guardrails (2–3 days)

- Freeze current renderer/preview/export behaviour with snapshot fixtures:
  - headings and source-line attributes;
  - wiki links, callouts, footnotes, tasks, tables, math, diagrams;
  - export HTML and PDF metadata.
- Add a `CALMMD_RUST_MARKDOWN` / `CALMMD_RUST_SPELL` / `CALMMD_PDF_ENGINE=ikat` style debug switch
  (env var or settings field) so changes are reversible.
- Update `THIRD_PARTY_LICENSES.md` with Mordant, zspell, ikat and dictionary licences.

**Exit:** baseline snapshots committed; feature flags in place.

### Phase 1 — Mordant Markdown service (1–2 weeks)

- Add `mordant = { version = "0.10", features = ["meta", "footnotes", "math", "diagram", "highlighter"] }`.
- Implement `parse_document(text) -> { headings, frontMatter, blocks }`.
- Implement `render_html(text, opts) -> { html, sourceMap }`.
- Port CalmMD extensions:
  - wiki links → `wiki:` hrefs;
  - callouts → current CSS classes;
  - task lists and `==highlight==`;
  - sub/superscript;
  - heading ids and `data-line-start`;
  - front matter hidden in preview/export.
- Expose Tauri commands: `markdown_render`, `markdown_parse`, `markdown_highlight_code`.
- In the webview, add `markdownService.ts` and use it behind the flag. Keep DOMPurify and the current
  patcher.

**Exit:** preview and outline snapshots match for the fixture corpus; scroll-sync test passes.

### Phase 2 — Syntax highlighting with Mordant (3–5 days)

- Wire `mordant::Highlighter` into fenced code blocks during `render_html`; this is enabled by
  `MarkdownRenderOptions.highlightCode`.
- Map current theme tokens to Mordant/syntect themes. The first slice generates a Mordant theme for
  every `ColorThemeId` from a Rust palette table in `core/highlight/mod.rs`, and a test checks those
  colours against `src/styles/tokens.css`. Preview themes map to the nearest full colour palette.
- Remove JS highlighting from the export path once snippets match. The Rust export path already
  passes the selected preview theme and uses Mordant highlighting.
- Keep CodeMirror's Lezer highlighting in the editor for now; it is interactive and incrementally
  reparses, which Mordant is not designed to replace.

**Exit:** code blocks in preview and HTML export use Mordant; dark/light themes pass visual snapshots.

### Phase 3 — zspell spellchecking (1 week)

- Add `zspell = { version = "0.5.5", features = ["unstable-suggestions"] }`.
- Bundle `en_US` `.aff`/`.dic` with their `(MIT AND BSD)` licence; add more languages by settings.
- Expose `core_spell_check`, `core_spell_check_text`, `core_spell_learn`; the TS platform layer
  switches to them when `useRustSpell()` is enabled and falls back to the OS commands otherwise.
- Convert byte ranges to UTF-16 ranges (`core/spell/utf16.rs`).
- Store learned words in `<appData>/state/spell~personal~en_US.kv` via the existing kv store.
- Remove the two OS-dictionary-dependent Rust tests; `cargo test` now uses the bundled dictionary.

**Exit:** `npm run test:rust` passes on this machine; editor underlines and right-click suggestions
behave as before when `useRustSpell()` is enabled and only en_US is bundled so far.

### Phase 4 — HTML export via Mordant (3–5 days)

- Replace `buildBody()`'s Markdown conversion with the Rust `markdown_render` service. The first
  slice injects a renderer through `BodyDeps.renderMarkdown` and is enabled only by the flag.
- Keep the existing document shell/CSS until visual parity is accepted.
- Use Mordant highlighter output for code blocks.
- Add source-map-aware tests comparing HTML snapshots.

**Exit:** `calmmd_export_html` output is byte-stable or diff-reviewed against current output.

### Phase 5a — Takumi PDF engine (1–2 weeks)

This is the LaTeX-free, CSS-compatible path and should be prototyped first.

- Integration: the native Rust binding was chosen after the MSRV was raised to 1.91. It renders the
  self-contained HTML with inline CSS, ignores Paged.js scripts, loads embedded fonts, and takes page
  geometry/headers/footers as Takumi options. The official browser/WASM npm package is the equivalent
  engine for the non-Tauri app. Select the Paged.js fallback with `VITE_CALMMD_PDF_ENGINE=browser` or
  `localStorage['calmmd.pdf.engine'] = 'browser'`.
- Feed the same standalone HTML used by current export into Takumi.
- Map `ExportPrefs` to Takumi options:
  - `pdf.pageSize` → page size;
  - `pdf.margins` → page margins;
  - `header`, `pageNumbers` → running header/footer templates;
  - `pdf.template` → four CalmMD-inspired CSS templates;
  - `toc` → generated contents block;
  - `cover`, `coverAuthor` → cover page;
  - `breakBeforeH1` → top-level heading page breaks.
- Add engine selection:
  - `takumi` — default CSS-based, LaTeX-free, browser-free engine;
  - `browser` — Paged.js/Chromium fallback;
  - `ikat` — later, optional typeset engine.
- Compare sample exports against Paged.js: headings, TOC, headers/footers, tables, code blocks,
  images, link annotations and text selectability.

**Exit reached:** a representative note exports to a paged PDF via Takumi with selectable text and
no TeX or browser dependency. A side-by-side review of five variants accepted Takumi as the default;
small typographic differences remain and the Paged.js engine stays available as an explicit fallback.

**Phase 1/4 exit reached:** the preview and HTML export use Rust Markdown by default; the extension
corpus HTML snapshot and the new 500-line scroll-sync anchor baseline pass on both renderers. The
TypeScript renderer remains a reversible fallback for debugging.

### Phase 5b — ikat PDF engine (1–2 weeks, plus TeX packaging decision)

Optional high-end typesetting path; not the default replacement for Paged.js.

- Add `ikat = "0.13"`.
- Implement `pdf_ikat::weave(text, prefs) -> .tex` first. No TeX needed for this step.
- Map `ExportPrefs`:
  - `pdf.pageSize` → ikat page geometry;
  - `pdf.margins` → geometry margins;
  - `header`, `pageNumbers` → head/foot templates;
  - `pdf.template` → initial four CalmMD-inspired ikat templates;
  - `toc`, `cover`, `coverAuthor` → document preamble;
  - `breakBeforeH1` → sectioning hooks.
- Compile with `pdflatex`, `tectonic` binary, or `texres` when available.
- Add `ikat_check` command to report missing TeX packages with actionable messages.
- Do not enable the `tectonic` Cargo feature initially; use an external binary where available.

**Exit:** a sample note exports to PDF with ikat where TeX is available; errors are clear when it is
not.

### Phase 6 — Rust document/explorer services (3–6 weeks)

This is where MCP gets simpler.

- Port `documents.ts` state machine into Rust: undo and the remaining editor runtime concerns.
  Draft
  records, disk writes and conflict detection are in `core/buffers.rs`; autosave timing and retries
  are in `core/autosave.rs`; `set_content_by_path` for MCP is in `core/workspace.rs`;
  session/cursor/Space records are in `core/session.rs`.
- Port the remaining `history.ts` UI into Rust. Version storage and compatibility are already in
  `core/history.rs`; restore/diff UI still lives in the webview.
- Explorer create/rename/move/trash and link retargeting are in `core/workspace.rs` and
  `core/links.rs`; the sidebar/tree view is still driven by webview events.
- Keep the webview as an event-driven view of Rust state; CodeMirror documents are mirrors, not the
  only source of truth.
- Expose the same operations through Tauri commands and direct MCP calls.

**Exit:** MCP tools no longer need `calmmd://mcp/request` for read/write/rename/move; the webview
receives state-change events instead.

### Phase 7 — Cleanup (1 week)

- Delete superseded TS modules and tests.
- Remove webview-only sanitisation if Rust output is trusted (or keep it deliberately).
- Narrow Tauri capabilities now that fewer commands need broad filesystem access.
- Update `ARCHITECTURE.md`, `MCP.md`, `CONTRIBUTING.md`, `THIRD_PARTY_LICENSES.md`.

---

## 7. MCP impact

Current flow:

```text
MCP tool → Tauri event → webview dispatcher → TS controllers → Tauri command → disk
```

Target flow after Phase 6:

```text
MCP tool → Rust core service → disk
                         └→ Tauri event → webview state update
```

Benefits:

- no 120-second webview response timeout for normal calls;
- reads and writes share the same Rust truth;
- no duplicate path sandbox logic;
- MCP tools become callable even before the webview finishes loading.

Phase 6's first slice keeps this bridge only for PDF/HTML export. The remaining user-edit state
machine (drafts, conflicts, autosave targets and explorer UI state) still lives in the webview and
is mirrored into Rust rather than fully owned there.

---

## 8. Testing strategy

| Layer | Tests |
|---|---|
| Markdown | golden HTML files, heading/source-map fixtures, extension corpus, 500-line scroll fixture |
| Highlighting | code-block snapshots in light/dark themes |
| Spell | bundled dictionary tests, Unicode/UTF-16 ranges, personal words |
| Export | HTML snapshots; PDF metadata/text extraction where possible |
| Tauri boundary | command DTO round-trips, error mapping |
| MCP | existing 3 Rust tests + full client smoke script (49 checks, re-run after the Takumi default) |
| UI | existing Vitest suite + manual split-view scroll check |

Run all of these in CI on Windows/macOS/Linux with Rust 1.91. Native Takumi PDF rendering runs in
the normal suite; the Paged.js fallback pagination test stays ignored locally and is enabled in CI.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Mordant output differs from markdown-it | feature flags, golden snapshots, custom renderer extensions |
| Missing `data-line-start` spans | add source-map pass before renderer; block release if scroll sync regresses |
| Mordant highlighter themes differ | keep CodeMirror highlighting until visual review; snapshot themes |
| zspell suggestions unstable | use bundled ranges first; OS/other suggestions as fallback |
| Dictionary licensing | choose allowed-licence dictionaries and list them explicitly |
| Takumi visual difference from Paged.js | accepted minor differences; browser engine available as explicit fallback |
| Takumi Rust MSRV 1.91 | MSRV raised to 1.91; native desktop binding compiled and tested on 1.91 |
| ikat visual difference from Paged.js | separate engine, opt-in, no default change until accepted |
| TeX unavailable on user machine | clear engine error; Takumi is the default and needs no TeX; document `texres`/`tectonic` for ikat |
| Large migration stalls | ship Phases 1–5 independently; each has user-visible value without Phase 6 |

---

## 10. Definition of done for the first useful milestone

Phases 0–4 are a successful first milestone:

- Mordant renders preview and HTML export behind a flag with matching snapshots;
- fenced code blocks use Mordant highlighting;
- zspell is available behind a flag for en_US with local personal words, and `cargo test` passes
  locally on every platform;
- MCP tests and the full MCP client smoke test still pass;
- no Tauri capabilities or privacy guarantees were widened.

Phase 5a (Takumi) is now the default PDF engine; Phase 5b (ikat) can ship later as a separately
reviewed typeset engine option.
