# Takumi visual-review screenshots

These screenshots compare the realistic `pdf.smoke.test.ts` export rendered by Paged.js and the native
Takumi engine. Left is always Paged.js; right is always Takumi. Takumi is now the default; Paged.js is
an explicit fallback.

The full-page images show a red rectangle around the region enlarged in the close-up.

| Open issue | Full page | Close-up | What to look for |
|---|---|---|---|
| Typography / rasterisation | [full](01-typography-full.png) | [close-up](01-typography-closeup.png) | Takumi uses `font-weight: 350` for inherited body text by default; line rasterisation still differs slightly. |
| Code-token colours | [full](02-code-tokens-full.png) | [close-up](02-code-tokens-closeup.png) | Token colours differ because the browser uses CSS/Lezer output while Takumi uses the embedded theme colours. |
| Task checkbox marks | [full](03-task-checkboxes-full.png) | [close-up](03-task-checkboxes-closeup.png) | The native controls are replaced with flow-positioned SVG marks; these screenshots verify the fixed layout. |

## Regenerating

```sh
mkdir -p /tmp/takumi-review/html /tmp/takumi-review/pdf
CALMMD_EXPORT_OUT=/tmp/takumi-review/html npx vitest run \
  src/export/pdf.smoke.test.ts src/export/takumi.visual.test.ts

CALMMD_PRINT_HTML=/tmp/takumi-review/html/print-paper.html \
CALMMD_PRINT_OUT=/tmp/takumi-review/pdf/paged-paper.pdf \
  cargo test --manifest-path src-tauri/Cargo.toml \
  export::tests::prints_file_from_env -- --ignored

CALMMD_TAKUMI_HTML=/tmp/takumi-review/html/print-paper.html \
CALMMD_TAKUMI_OPTIONS=/tmp/takumi-review/html/takumi-paper.json \
CALMMD_TAKUMI_OUT=/tmp/takumi-review/pdf/takumi-paper.pdf \
  cargo test --manifest-path src-tauri/Cargo.toml \
  core::export::takumi::tests::renders_file_from_env -- --ignored
```

Then rasterise pages 2–4 with `pypdfium2` and compose the side-by-side images. The rendered page
size is A4 at 96 dpi in both engines.
