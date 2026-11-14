import { For } from 'solid-js';
import { docName, type Documents } from '../app/documents';
import { IconPlus } from './icons';

/** Open documents. Always shown, so it's clear what's open and how to start another. */
export function TabStrip(props: { docs: Documents; newTabHint?: string }) {
  const store = props.docs.store;
  return (
    <nav class="tabstrip" role="tablist" onDblClick={(e) => e.target === e.currentTarget && props.docs.newDoc()}>
      <For each={store.docs}>
        {(doc) => (
          <div
            role="tab"
            class="tab"
            classList={{ active: doc.id === store.activeId, dirty: doc.status !== 'clean' || doc.conflict }}
            aria-selected={doc.id === store.activeId}
            title={doc.path ?? docName(doc)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void props.docs.close(doc.id);
              } else if (e.button === 0) props.docs.activate(doc.id);
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
              <svg class="tab-x" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
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
