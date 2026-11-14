// Attributes that don't change what a block *is*: its source position and the cursor marker.
const LINE_ATTRS = / data-line-(?:start|end)="\d+"| data-cursor=""/g;

/**
 * Elements the user changed in place (an embed that's now playing) keep the markup they were rendered
 * with, so they still match the next render and aren't replaced, which would stop the video.
 */
const originals = new WeakMap<Element, string>();
export function rememberOriginal(el: Element) {
  if (!originals.has(el)) originals.set(el, el.outerHTML);
}

function keyOf(node: ChildNode): string {
  if (node.nodeType !== 1) return '#' + node.nodeType + ':' + (node.textContent ?? '');
  const el = node as Element;
  let html = el.outerHTML;
  for (const changed of el.querySelectorAll('.embed-active')) {
    const orig = originals.get(changed);
    if (orig) html = html.replace(changed.outerHTML, orig);
  }
  return html.replace(LINE_ATTRS, '');
}

/** Copies the source-line attributes from a fresh node onto a reused node with identical structure. */
function copyLineAttrs(from: ChildNode, to: ChildNode) {
  if (from.nodeType !== 1) return;
  const f = from as Element;
  const t = to as Element;
  const copy = (a: Element, b: Element) => {
    for (const name of ['data-line-start', 'data-line-end']) {
      const v = a.getAttribute(name);
      if (v !== null && b.getAttribute(name) !== v) b.setAttribute(name, v);
    }
  };
  copy(f, t);
  const fs = f.querySelectorAll('[data-line-start]');
  const ts = t.querySelectorAll('[data-line-start]');
  for (let i = 0; i < fs.length && i < ts.length; i++) copy(fs[i], ts[i]);
}

/**
 * Updates `container` to match `html`, reusing unchanged top-level blocks. Line shifts only
 * update attributes. This keeps images, embeds and selection stable while typing and avoids a
 * full reflow. Returns the number of elements that were newly created.
 */
export function patchChildren(container: Element, html: string): number {
  const tpl = container.ownerDocument.createElement('template');
  tpl.innerHTML = html;
  const incoming = [...tpl.content.childNodes];

  const pool = new Map<string, ChildNode[]>();
  for (const n of [...container.childNodes]) {
    const k = keyOf(n);
    const list = pool.get(k);
    if (list) list.push(n);
    else pool.set(k, [n]);
  }

  let created = 0;
  const result = incoming.map((n) => {
    const reuse = pool.get(keyOf(n))?.shift();
    if (reuse) {
      copyLineAttrs(n, reuse);
      return reuse;
    }
    if (n.nodeType === 1) created++;
    return n;
  });

  // Remove what isn't reused first, so the walk below moves as few nodes as possible.
  // Moving an iframe would reload it.
  for (const list of pool.values()) for (const n of list) n.remove();

  let cursor = container.firstChild;
  for (const node of result) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }
    container.insertBefore(node, cursor);
  }
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
  return created;
}
