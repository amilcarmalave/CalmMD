<p align="center">
  <a href="https://amilcarmalave.github.io/CalmMD/"><img src="docs/screenshots/banner.png" alt="CalmMD: Markdown, calmly. A free, open-source Markdown editor." width="100%"></a>
</p>

<p align="center">
  <a href="../../releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/amilcarmalave/CalmMD?style=flat-square&color=e8a23b&label=release"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-1f2a44?style=flat-square"></a>
  <img alt="Windows, macOS and Linux" src="https://img.shields.io/badge/platforms-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-1f2a44?style=flat-square">
  <a href="../../actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/amilcarmalave/CalmMD/ci.yml?branch=main&style=flat-square&label=tests"></a>
</p>

<p align="center">
  <strong><a href="../../releases/latest">Download</a></strong> ·
  <a href="https://amilcarmalave.github.io/CalmMD/">Website</a> ·
  <a href="#features">Features</a> ·
  <a href="#building-from-source">Build from source</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

**CalmMD is a quiet place to write.** Type Markdown and watch it become a beautiful page, then
export a PDF worth sending. Your notes stay plain `.md` files in your own folders. There's no
account, no tracking and no paid tier: every feature is free, for everyone.

- **Live mode** renders as you type and shows the Markdown only where your cursor is, so you write in a
  finished page without losing control of the source.
- **Split view with scroll sync that actually lines up.** Every rendered block is mapped to its
  source lines, so images, tables and code stay aligned in both directions.
- **PDFs worth sending.** Page numbers, running headers, a table of contents with real page numbers, cover
  pages and four templates. No LaTeX.
- **Your files, forever.** They read the same on GitHub, in Obsidian, in VS Code or in Notepad. Sync them with
  Dropbox, iCloud or OneDrive, keep them in Git. Nothing to import, nothing locked in.

<table>
<tr>
<td colspan="2"><img src="docs/screenshots/live-light.png" alt="Live mode: the page renders as you type, and the Markdown shows only where the cursor is"></td>
</tr>
<tr>
<td colspan="2" align="center"><sub><b>Live mode:</b> a finished page as you type. The Markdown (here <code>**bold**</code>) appears only where your cursor is</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/split-light.png" alt="Split view: the Markdown source beside the rendered page"></td>
<td width="50%"><img src="docs/screenshots/split-dark.png" alt="Split view in GitHub Dark with the GitHub document style"></td>
</tr>
<tr>
<td align="center"><sub>Split view with accurate scroll sync</sub></td>
<td align="center"><sub>GitHub Dark with the GitHub document style</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/pdf-export.png" alt="PDF export with templates and a cover page"></td>
<td><img src="docs/screenshots/palette.png" alt="The command palette in the Midnight theme"></td>
</tr>
<tr>
<td align="center"><sub>PDF export with templates and a cover page</sub></td>
<td align="center"><sub>Every command one keystroke away</sub></td>
</tr>
</table>

## Features

| | |
|---|---|
| **Four views** | Source · Live · Split · Preview (`Ctrl/⌘+E` to cycle). Enter starts a new paragraph, so files read the same on GitHub |
| **Writing** | GFM tables, task lists, footnotes, `==highlight==`, any text or highlight colour, sub/superscript, GitHub-style callouts, front matter, HTML, KaTeX math, Mermaid diagrams, syntax-highlighted code, video embeds |
| **Images** | Paste or drop images: they're saved in an `assets` folder next to the note and linked relatively. Drag to resize, align left, center or right, all in standard Markdown (`![Photo\|300\|center](photo.png)`) |
| **Drawings** | Sketch with [Excalidraw](https://excalidraw.com) right in the app (Insert → Drawing, or `/drawing`). Each drawing is its own `.excalidraw.svg` file next to your notes: a picture that shows on GitHub and anywhere else, with the editable drawing inside. Double-click it to edit |
| **Files** | A folder sidebar with favourites, outline and tabs that come back after a restart. Other files open in a Quick view: images, PDFs, CSV and code. `.txt` files open as plain text |
| **File history** | Earlier versions of each file, saved when you close it or when you ask. Compare side by side and restore in one click. Versions stay in the app's data, never in your folders |
| **Links and search** | Search every note in a folder (`Ctrl/⌘+Shift+F`), link notes with a `[[` picker, `[[Wiki links]]`, and "Linked from" for the open note |
| **Spaces** | Save a window (folder, tabs, layout) as a Space and switch with `Ctrl/⌘+Alt+O`, or open Spaces in their own windows |
| **Finding things** | Command palette (`Ctrl/⌘+Shift+P`), go to file (`Ctrl/⌘+P`), line (`:`), heading (`@`), and `/` on an empty line to insert anything |
| **Export and share** | PDF with templates (Standard, Report, Academic, Minimal) and cover pages, standalone HTML, Copy as HTML, a note with its images as one file or a `.zip`, and Word/ODT/EPUB when [Pandoc](https://pandoc.org) is installed |
| **Looks** | Fifteen colour themes, from Snow and Paper to Solarized, Fjord and Nightshade, with separate light and dark choices; five document styles (Book, Studio, Clear, GitHub, Typewriter); text width from narrow to full; your own CSS themes |
| **Safety** | Autosave with crash-safe atomic writes, drafts for untitled notes, and it never overwrites changes made by other apps |

### PDF export

PDFs are laid out with [Paged.js](https://pagedjs.org) and printed by a Chromium engine. On
**Windows** that's Microsoft Edge, which comes with Windows, so there's nothing to install. On macOS
and Linux, any installed Chrome, Edge, Chromium or Brave is used. Without one, CalmMD opens the
system print dialog ("Save as PDF") instead. Put `---pagebreak---` on its own line for a manual page
break. See [`docs/samples`](docs/samples) for example output.

### Your own themes

Open **View → Document Style → Open Themes Folder…** and drop in a `.css` file. A comment at the top
names it and picks the built-in style it starts from:

```css
/* @name Sepia
   @base paper */
:root { --preview-bg: #f5ecdc; }
.md-body { --fg: #46382a; --link: #9a4d12; }
```

Themes apply to the preview, Live mode and every export.

### Keyboard

`Ctrl` on Windows and Linux, `⌘` on macOS. **Help → Keyboard Shortcuts** (`F1`) lists them all.

| Action | Shortcut | Action | Shortcut |
|---|---|---|---|
| Command palette | `Mod+Shift+P` | Go to file | `Mod+P` |
| Cycle view mode | `Mod+E` | Sidebar | `Mod+\` |
| Bold / Italic / Link | `Mod+B` / `Mod+I` / `Mod+K` | Heading 1–6 | `Mod+Shift+1…6` |
| Toggle task | `Mod+Enter` | Switch Space | `Mod+Alt+O` |
| Highlight | `Mod+Shift+M` | All shortcuts | `F1` |

## Download

Get the latest version for your system from [Releases](../../releases/latest), or from the
[website](https://amilcarmalave.github.io/CalmMD/), which picks the right file for you.

| System | Files |
|---|---|
| **Windows** 10 and 11 | `.exe` installer (no admin rights needed) or `.msi`, for x64 and ARM |
| **macOS** | `.dmg` for Apple silicon and Intel |
| **Linux** | `.AppImage`, `.deb` or `.rpm` |

The installers aren't signed with a paid certificate yet, so the first launch shows a warning:

- **Windows:** "Windows protected your PC" → **More info** → **Run anyway**.
- **macOS:** right-click CalmMD in Applications → **Open** → **Open**. On recent macOS, go to
  System Settings → Privacy & Security → **Open Anyway**.

## Building from source

You need [Node.js](https://nodejs.org) 20+ and [Rust](https://rustup.rs) (stable), plus the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```sh
npm install
npm run app:dev     # the desktop app with hot reload
npm run app:build   # installers in src-tauri/target/release/bundle
```

`npm run dev` runs the editor in a browser (no Rust needed) against an in-memory file system, which is
handy for UI work. Add `?demo` to the URL for a showcase document.

## Privacy

CalmMD never contacts a server of its own: no telemetry, no update pings, no account. It works fully
offline. Remote images in your documents load like they would in a browser, and video embeds stay
inert until you click them, then use YouTube's privacy-enhanced domain.

## Contributing

Bug reports, ideas and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). How the code fits
together is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and product decisions are in [SPEC.md](SPEC.md).

If CalmMD is useful to you, the best way to help is to **star the repository** and tell a friend.

## License

[MIT](LICENSE) © CalmMD contributors. Third-party components are listed in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
