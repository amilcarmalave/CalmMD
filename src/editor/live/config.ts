import { Facet } from '@codemirror/state';

/** What live mode needs from the app (kept out of the editor module so it stays testable). */
export interface LiveConfig {
  /** Absolute URL for an image src as written in the document. */
  resolveImage: (src: string) => string;
  /** Rendered, sanitised HTML for a Markdown fragment (tables). */
  renderMarkdown: (md: string) => string;
  /** Opens a link (Mod+click). */
  openLink: (href: string) => void;
  /** A missing image's "Locate…" button: pick the file and fix the link. */
  locateImage?: (src: string) => void;
  /** Effective colour scheme, for diagrams. */
  colorScheme: () => 'light' | 'dark';
}

export const liveConfig = Facet.define<LiveConfig, LiveConfig>({
  combine: (values) =>
    values[0] ?? {
      resolveImage: (s) => s,
      renderMarkdown: () => '',
      openLink: () => {},
      colorScheme: () => 'light',
    },
});
