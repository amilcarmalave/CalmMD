import { For } from 'solid-js';
import { docName, type Documents } from '../app/documents';
import { basename } from '../core/paths';
import { IconPlus } from './icons';

/** A tab for a file that isn't a note: a drawing, image, PDF or anything else shown in the main area. */
export interface FileTab {
  id: string;
  path: string;
  /** False for a new drawing whose file isn't written yet. */
  exists: boolean;
}

const CloseX = () => (
  <svg class="tab-x" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 2l6 6M8 2l-6 6" />
  </svg>
);

/** Open documents and files. Always shown, so it's clear what's open and how to start another. */
export function TabStrip(props: {
  docs: Documents;
  newTabHint?: string;
  files: FileTab[];
  /** The file tab being shown, or null when a note is. */
  activeFile: string | null;
  onFile: (id: string) => void;
  onCloseFile: (id: string) => void;
  /** A note tab was clicked (also when it's already the active note, to leave a file tab). */
  onDoc: () => void;
}) {
  const store = props.docs.store;
  const fileName = (p: string) => basename(p).replace(/\.excalidraw(\.svg)?$/i, '');
  return (
    <nav class="tabstrip" role="tablist" onDblClick={(e) => e.target === e.currentTarget && props.docs.newDoc()}>
      <For each={store.docs}>
        {(doc) => (
          <div
            role="tab"
            class="tab"
            classList={{ active: doc.id === store.activeId && !props.activeFile, dirty: doc.status !== 'clean' || doc.conflict }}
            aria-selected={doc.id === store.activeId && !props.activeFile}
            title={doc.path ?? docName(doc)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void props.docs.close(doc.id);
              } else if (e.button === 0) {
                props.docs.activate(doc.id);
                props.onDoc();
              }
            }}
          >
            <span class="tab-name">{docName(doc)}</span>
            <button
              class="tab-close"
              aria-label={`Close ${docName(doc)}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => void props.docs.close(doc.id)}
            >
              <span class="tab-dot" aria-hidden="true" />
              <CloseX />
            </button>
          </div>
        )}
      </For>
      <For each={props.files}>
        {(f) => (
          <div
            role="tab"
            class="tab file-tab"
            classList={{ active: f.id === props.activeFile }}
            aria-selected={f.id === props.activeFile}
            title={f.path}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                props.onCloseFile(f.id);
              } else if (e.button === 0) props.onFile(f.id);
            }}
          >
            <span class="tab-name">{fileName(f.path)}</span>
            <button class="tab-close" aria-label={`Close ${basename(f.path)}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => props.onCloseFile(f.id)}>
              <CloseX />
            </button>
          </div>
        )}
      </For>
      <button
        class="icon-btn tab-new"
        title={props.newTabHint ? `New document  ${props.newTabHint}` : 'New document'}
        aria-label="New document"
        onClick={() => props.docs.newDoc()}
      >
        <IconPlus />
      </button>
    </nav>
  );
}
