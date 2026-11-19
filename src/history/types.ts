/** One saved file version. The shape matches Rust `core::history::Version`. */
export interface HistoryVersion {
  id: string;
  savedAt: number;
  name: string | null;
  /** UTF-16 code units, like JavaScript `String.length`. */
  size: number;
  hash: string;
}

export interface HistoryUsage {
  files: number;
  versions: number;
  chars: number;
}
