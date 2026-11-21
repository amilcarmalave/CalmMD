# MCP server

CalmMD can run a small, local [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server, so an AI app on your computer (Claude Code, Claude Desktop, Cursor, VS Code and others) can
work with the notes in the folder you have open in CalmMD.

This page explains how the server works, what it can do and where its limits are. To connect a
client, see [MCP-CLIENT-SETUP.md](MCP-CLIENT-SETUP.md). For the rest of the app, see
[ARCHITECTURE.md](ARCHITECTURE.md).

- **Off by default.** Nothing listens until you start it.
- **Local only.** It listens on `127.0.0.1`, so other machines can't reach it, and every request
  needs a token.
- **No AI inside CalmMD.** The model stays in the client you connect. CalmMD supplies the notes and
  carries out the changes. There is no account, cloud service or telemetry.

## How it fits into the app

The server is a bridge into the running app, not a second way of touching files. Every call goes
through the same code as the editor itself:

- **Reads** use the open editor buffer when a note is open, so unsaved changes are included.
- **Writes** go through the document manager, so they are undoable, autosaved, respect save
  conflicts and are recorded in file history (when it is on).
- **Renames and moves** go through the file explorer, so tabs, favorites and history follow the
  file, and links to it in other notes are updated.
- **Exports** use the same renderer and print engine as File → Export.

```text
MCP client (Claude Code, Cursor, …)
        │  MCP over Streamable HTTP
        ▼
Rust MCP server                         src-tauri/src/mcp/
  mod.rs      lifecycle, token, Origin check, commands
  bridge.rs   matches requests to responses, picks the window
  tools.rs    tools, prompts, resources and client guidance
        │  Tauri event: calmmd://mcp/request
        ▼
Webview bridge                          src/app/mcpBridge.ts
  docs / explorer / exporter / search
        │  invoke: mcp_respond
        ▼
Platform layer → Tauri commands → disk
```

The protocol lives entirely in Rust (`rmcp`). The webview has no MCP code: it receives a request,
runs it against the live app and answers. A request waits up to 120 seconds for an answer, which
leaves time for the user to answer a confirmation dialog.

## Security

| | |
|---|---|
| Address | `http://127.0.0.1:<port>/mcp`, never `0.0.0.0` |
| Authentication | `Authorization: Bearer <token>` on every request |
| Browsers | Requests from a web page are refused: `Origin` must be absent, `null` or `localhost`, `127.0.0.1` or `::1` |
| Paths | Every path must be inside the open folder. `..` and paths outside it are refused, including export destinations |
| Trash | Needs `confirm: true` from the client, and CalmMD still asks the user before moving the file to the system Trash |

The port and token are remembered between launches in CalmMD's own state folder
(`<app data>/state/mcp~endpoint.kv`), so a client only needs setting up once. If the remembered
port is taken, the server picks another free one. **New MCP Token** replaces the token and keeps the
port; the old token stops working at once.

The token is stored as a plain file in the app's data folder, like the rest of CalmMD's settings.
A program that can read that file could also read your notes directly, so it adds no new exposure.

## Starting and stopping

- **File → Start MCP Server**, or `Start MCP Server` in the command palette. The connection string
  (`url · token: …`) is copied to the clipboard.
- **File → Stop MCP Server** and **File → New MCP Token**.
- **Auto-start MCP Server** (menu or palette) starts it with CalmMD. Stored as `mcpAutostart`,
  off by default.
- Launching CalmMD with `--mcp` starts it too.
- A small **MCP** marker shows in the status bar while it runs.

## Tools

Every tool except `calmmd_status` accepts two optional routing fields. Without them the call goes to
the main window.

| Field | Meaning |
|---|---|
| `windowLabel` | Run in this window (labels come from `calmmd_windows`) |
| `spaceId` | Run in the window that currently holds this Space |

| Tool | Arguments | What it does |
|---|---|---|
| `calmmd_status` | | Open folder, open tabs and the active note |
| `calmmd_windows` | | Window labels, titles and Space ids |
| `calmmd_list_documents` | `markdownOnly?`, `folder?` | Files in the open folder, open or not |
| `calmmd_read_document` | `path` | Note text (live buffer if open) and its headings |
| `calmmd_search` | `query`, `caseSensitive?`, `wholeWord?` | Search across the folder |
| `calmmd_outline` | `path` | Headings of a note |
| `calmmd_create_document` | `folder?`, `name`, `text?` | New note, optionally with text |
| `calmmd_create_folder` | `folder?`, `name` | New folder |
| `calmmd_rename_document` | `path`, `name` | Rename; links to it are updated |
| `calmmd_move_document` | `path`, `folder`, `name?` | Move (and optionally rename); links are updated |
| `calmmd_write_document` | `path`, `content`, `mode?`, `flush?` | `replace` (default), `append` or `prepend`; undoable |
| `calmmd_trash_document` | `path`, `confirm` | Move to the system Trash after the user confirms |
| `calmmd_triage_folder` | `folder?`, `limit?`, `excerptChars?` | Excerpts, headings and front matter for organising a folder |
| `calmmd_apply_organization` | `folder?`, `plan`, `apply?` | Check and carry out a plan of moves and renames |
| `calmmd_export_pdf` | `path`, `out`, `prefs?`, `cover?` | Export a PDF; missing folders in `out` are created |
| `calmmd_export_html` | `path`, `out`, `prefs?`, `cover?` | Export standalone HTML |

### Organising a folder

1. `calmmd_triage_folder` lists the folder's notes with short excerpts, headings, front matter and
   existing subfolders.
2. The client's model proposes a plan of `{ from, toFolder, newName?, reason? }` moves. The
   `calmmd_organize_folder` prompt asks for exactly that.
3. `calmmd_apply_organization` with `apply: false` checks the plan and returns a preview. With
   `apply: true` it creates folders and moves files through the explorer, so links follow.
   Each move is reported separately; a failed move doesn't undo the others.

### Export preferences

`prefs` takes the same options as the export dialog. Anything left out uses the defaults:

```jsonc
{
  "pdf": {
    "pageSize": "A4",        // A4 | Letter | A5 | Legal
    "margins": "normal",     // narrow | normal | wide
    "header": true,
    "pageNumbers": true,
    "breakBeforeH1": false,
    "template": "standard"   // standard | report | academic | minimal
  },
  "toc": false,
  "embedImages": true,       // PDFs always embed images
  "theme": null,             // document style id, or null for the preview style
  "cover": false,
  "coverAuthor": ""
}
```

`cover` (`title`, `subtitle`, `author`, `date`) adds a cover page. Fields you leave out come from the
note, the same way the export dialog fills them.

## Prompts

Prompts give the client's model the note and instructions; the model writes the text, and the
client saves it with `calmmd_write_document` (usually `mode: "append"`).

| Prompt | Arguments | Asks for |
|---|---|---|
| `calmmd_summarize` | `path` | A short Markdown summary of the note |
| `calmmd_follow_up_guide` | `path` | A title, 3–6 numbered next steps and a checklist |
| `calmmd_organize_folder` | `folder?`, `limit?`, `excerptChars?` | A JSON plan for `calmmd_apply_organization` |

All of them also accept the routing fields.

## Resources

Read-only, for clients that support MCP resources:

| URI | Content |
|---|---|
| `calmmd://status` | Status of the main window |
| `calmmd://windows` | Windows, titles and Space ids |
| `calmmd://document/{path}` | A note's live Markdown |
| `calmmd://folder/{path}` | Markdown files in a folder |

Paths are percent-encoded, and `windowLabel` or `spaceId` can be added as query parameters, for
example `calmmd://document/notes%2Fplan.md?spaceId=writing`.

## Guidance for clients

When a client connects, the server sends instructions on how to use these tools well: read before
writing, prefer append over replace, preview an organisation plan before applying it, stop on a
save conflict, and trash only with the user's agreement. The instructions and the tool descriptions
live in `src-tauri/src/mcp/tools.rs`, so every client gets the same guidance.

## Limits

- **HTTP only.** Clients that can only start stdio servers can't connect directly yet.
- **Links:** image links (`![alt](…)`) aren't updated on rename, links inside code are left alone
  on purpose, and a file renamed in another app looks to CalmMD like a delete and a new file.
- **Markdown only for reading and export.** Other files are listed but can't be read or exported.
- **No folder trash.** Folders can be created but not removed through MCP.
- **One permission level.** A running server can use every tool on the open folder; there are no
  read-only or per-tool settings.
