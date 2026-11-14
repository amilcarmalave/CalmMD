import { docName, type DocMeta, type Documents } from '../app/documents';

export function ConflictBanner(props: { doc: DocMeta; docs: Documents }) {
  return (
    <div class="banner" role="status">
      <span>
        <strong>{docName(props.doc)}</strong> was changed by another app. Your edits are kept safe.
      </span>
      <span class="banner-actions">
        <button class="btn btn-small" onClick={() => void props.docs.loadTheirs(props.doc.id)}>
          Load from disk
        </button>
        <button class="btn btn-small btn-primary" onClick={() => void props.docs.keepMine(props.doc.id)}>
          Keep mine
        </button>
      </span>
    </div>
  );
}
