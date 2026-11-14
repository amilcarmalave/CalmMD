import { DEV_TEST_KEY } from '../app/proConfig';
import { createMemoryPlatform } from './memory';

/**
 * Demo mode for the browser build (never in the desktop app): `?demo` loads a showcase folder and
 * layout into a throwaway in-memory store. Used for README screenshots, so they're reproducible:
 *
 *   ?demo&mode=split&scheme=dark&theme=studio&sidebar=outline&palette=>head
 *   &light=github-light&dark=code-dark&toolbar=0&md=<base64url document>
 */
const WELCOME = `# Welcome to CalmMD

A quiet place to write. Everything is **saved automatically**, and Markdown renders *as you type*. The syntax comes back only where your cursor is.

## Today

- [x] Draft the outline
- [x] Collect the references
- [ ] Write the conclusion

> Good tools disappear. What remains is the work.

## Numbers that matter

| Feature | Status | Notes |
| :--- | :---: | ---: |
| Live mode | Ready | renders in place |
| Scroll sync | Ready | < 0.03 lines |
| PDF export | Ready | Paged.js |

The area under the curve is $\\int_0^1 x^2\\,dx = \\tfrac{1}{3}$, and the roots are

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

## How it flows

\`\`\`mermaid
flowchart LR
  Write --> Preview --> Export
\`\`\`

\`\`\`ts
export function greet(name: string): string {
  // Calm, typed, highlighted.
  return \`Hello, \${name}!\`;
}
\`\`\`

## Notes

Press \`Ctrl/Cmd+Shift+P\` for every command, or type \`/\` on an empty line to insert a block.
`;

const FILES: Record<string, string> = {
  '/Notes/Welcome to CalmMD.md': WELCOME,
  '/Notes/Ideas.md': '# Ideas\n\n## Small\n\n- Calm defaults\n- Fewer buttons\n\n## Large\n\n- Spaces for every project\n',
  '/Notes/Reading list.md': '# Reading list\n\n- [ ] *The Elements of Typographic Style*\n- [x] *Thinking with Type*\n',
  '/Notes/Journal/2026-11-12.md': '# Thursday\n\nShipped the export pipeline.\n',
  '/Notes/Journal/2026-11-11.md': '# Wednesday\n\nScroll sync is exact now.\n',
  '/Notes/Projects/Thesis/Chapter 1.md': '# Chapter 1\n\n## Introduction\n',
  '/Notes/Projects/Thesis/Chapter 2.md': '# Chapter 2\n',
  '/Notes/Projects/Thesis/Chapter 10.md': '# Chapter 10\n',
  // Non-note files, for the file list and Quick view. Images are data URLs in the memory platform.
  '/Notes/assets/sunrise.svg': `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f2a44"/><stop offset="1" stop-color="#3b4a72"/></linearGradient></defs><rect width="1200" height="600" fill="url(#g)"/><circle cx="930" cy="170" r="90" fill="#e8a23b"/><path d="M0 470 Q300 360 600 450 T1200 420 V600 H0z" fill="#faf8f4" opacity=".9"/></svg>',
  )}`,
  '/Notes/Projects/Thesis/results.csv': 'Trial,Words,Minutes,Notes\n1,1200,45,"Morning, quiet"\n2,860,30,Afternoon\n3,1530,60,"Long ""flow"" session"\n',
  '/Notes/Projects/settings.json': '{\n  "theme": "snow",\n  "fontScale": 1.1,\n  "spaces": ["Thesis", "Journal"]\n}\n',
};

export function createDemoPlatform(params: URLSearchParams) {
  const mode = params.get('mode') ?? 'live';
  const scheme = params.get('scheme') ?? 'light';
  const theme = params.get('theme') ?? 'paper';
  const sidebar = params.get('sidebar') ?? 'files';
  // ?md=<base64url> opens that text as the active document (visual checks of rendering).
  const md = params.get('md');
  const files = { ...FILES };
  const extra = md ? '/Notes/Scratch.md' : null;
  if (extra) files[extra] = new TextDecoder().decode(Uint8Array.from(atob(md!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
  const platform = createMemoryPlatform({ kind: 'web', files, windowLabel: 'main' });
  // Like the desktop app on Windows, where Edge prints PDFs (keeps the export dialog realistic in screenshots).
  platform.findBrowser = async () => 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const light = params.get('light') ?? 'snow';
  const dark = params.get('dark') ?? 'ink';
  const toolbar = params.get('toolbar') !== '0';
  void platform.kvSet(
    'settings',
    JSON.stringify({ v: 2, viewMode: mode, colorScheme: scheme, previewTheme: theme, splitRatio: 0.5, lightTheme: light, darkTheme: dark, toolbarVisible: toolbar }),
  );
  // ?pro: start with the test licence active (screenshots of Pro features).
  if (params.has('pro'))
    void platform.kvSet('license', JSON.stringify({ key: DEV_TEST_KEY, instanceId: 'dev-instance', email: 'test@example.com', name: null, productId: 1, activatedAt: Date.now(), validatedAt: Date.now() }));
  void platform.kvSet('favorites', JSON.stringify([{ path: '/Notes/Projects/Thesis', isDir: true }]));
  void platform.kvSet(
    'session',
    JSON.stringify({
      v: 1,
      tabs: [
        // Cursor at the end, so every element on screen is rendered (nothing revealed).
        { path: '/Notes/Welcome to CalmMD.md', cursor: WELCOME.length, topLine: 0 },
        { path: '/Notes/Ideas.md', cursor: 0, topLine: 0 },
        ...(extra ? [{ path: extra, cursor: files[extra].length, topLine: 0 }] : []),
      ],
      active: extra ? 2 : 0,
      root: '/Notes',
      expanded: ['/Notes/Journal'],
      sidebar: { open: sidebar !== 'none', view: sidebar === 'outline' ? 'outline' : 'files', width: 240 },
      viewMode: mode,
    }),
  );
  return platform;
}
