/** Live document mirror sent from the webview to the Rust workspace service. */
export interface WorkspaceDocument {
  path: string;
  text: string;
  eol: string;
  bom: boolean;
  mtimeMs: number | null;
  dirty: boolean;
  conflict: boolean;
}

export interface WorkspaceSnapshot {
  root: string | null;
  documents: WorkspaceDocument[];
  activeDocument: string | null;
}

/** A change made by Rust; the webview applies it without writing the file again. */
export type WorkspaceEvent =
  | { kind: 'content'; path: string; text: string; mtimeMs: number | null }
  | { kind: 'renamed'; from: string; to: string }
  | { kind: 'created'; path: string; isDir: boolean }
  | { kind: 'trashed'; path: string; isDir: boolean };
