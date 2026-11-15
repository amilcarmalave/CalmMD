// CalmMD website: the typing demo, the screenshot toggle, and download links from the latest release.
const REPO = 'amilcarmalave/CalmMD';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Typing demo: Markdown on the left, rendered on the right ---------- */
const DOC = `# Trip to Lisbon

Pack **light**, walk ==everywhere==.

- [x] Book the flat in Alfama
- [ ] Pastéis de nata at Manteigaria
- [ ] Sunset at Miradouro da Graça

> [!TIP]
> Tram 28 fills up by 9am. Go early.`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

/** The same text with its Markdown syntax tinted, the way the editor shows it. */
function highlight(src) {
  return src
    .split('\n')
    .map((line) => {
      let m;
      if ((m = /^(#{1,6} )(.*)$/.exec(line))) return `<span class="m">${m[1]}</span><b>${esc(m[2])}</b>`;
      if ((m = /^(- \[[ x]\] |- )(.*)$/.exec(line))) return `<span class="m">${esc(m[1])}</span>${tintInline(m[2])}`;
      if ((m = /^(> ?)(\[!\w*\]?)?(.*)$/.exec(line))) return `<span class="m">${esc(m[1])}${esc(m[2] ?? '')}</span>${tintInline(m[3])}`;
      return tintInline(line);
    })
    .join('\n');
}
const tintInline = (s) => esc(s).replace(/(\*\*|==|`)/g, '<span class="m">$1</span>');

function render(src) {
  const lines = src.split('\n');
  let html = '';
  let list = null;
  let quote = null;
  const close = () => {
    if (list) html += `<ul>${list}</ul>`;
    if (quote) html += `<div class="callout">${quote}</div>`;
    list = quote = null;
  };
  for (const line of lines) {
    let m;
    if ((m = /^- \[([ x])\] ?(.*)$/.exec(line)) || (m = /^- ()(.*)$/.exec(line))) {
      if (quote) close();
      const task = m[1] !== '';
      list = (list ?? '') + `<li class="${m[1] === 'x' ? 'done' : ''}">${task ? '<span class="box"></span>' : '•'}<span>${inline(m[2])}</span></li>`;
      continue;
    }
    if ((m = /^> ?(.*)$/.exec(line))) {
      if (list) close();
      const t = /^\[!(\w*)\]?$/.exec(m[1]);
      quote = (quote ?? '') + (t ? `<b>${esc(t[1] || ' ')}</b>` : `${inline(m[1])} `);
      continue;
    }
    close();
    if ((m = /^#{1,6} (.*)$/.exec(line))) html += `<h1>${inline(m[1])}</h1>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  close();
  return html;
}

const srcEl = document.getElementById('demo-src');
const outEl = document.getElementById('demo-out');
const demoEl = document.getElementById('demo');
let mode = 'live';
let userPicked = false;

/** The line being typed, in Live mode: styled like its block, with its Markdown still showing. */
function liveLine(line) {
  const kind = /^#{1,6} /.test(line) ? 'h1' : /^- /.test(line) ? 'li' : /^>/.test(line) ? 'quote' : 'p';
  return `<div class="live-cur ${kind}">${highlight(line)}<span class="caret"></span></div>`;
}

function show(text) {
  if (mode === 'split') {
    srcEl.innerHTML = highlight(text);
    outEl.innerHTML = render(text);
    return;
  }
  // Live: finished lines render; the line under the cursor shows its syntax, as in CalmMD.
  const cut = text.lastIndexOf('\n');
  outEl.innerHTML = render(cut < 0 ? '' : text.slice(0, cut)) + liveLine(cut < 0 ? text : text.slice(cut + 1));
}

function setMode(m) {
  mode = m;
  demoEl.classList.toggle('live', m === 'live');
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-selected', String(b.dataset.mode === m));
}
let current = '';
for (const b of document.querySelectorAll('[data-mode]'))
  b.addEventListener('click', () => {
    userPicked = true;
    setMode(b.dataset.mode);
    show(current);
  });

if (srcEl && outEl) {
  const realShow = show;
  show = (text) => realShow((current = text));
  if (reduceMotion) show(DOC);
  else {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(outEl);
    (async function loop() {
      for (;;) {
        for (let i = 0; i <= DOC.length; i++) {
          while (!visible) await sleep(300);
          show(DOC.slice(0, i));
          const ch = DOC[i - 1];
          await sleep(ch === '\n' ? 260 : ch === ' ' ? 55 : 22 + Math.random() * 38);
        }
        await sleep(5200);
        for (let i = DOC.length; i >= 0; i -= 6) {
          show(DOC.slice(0, i));
          await sleep(12);
        }
        await sleep(700);
        // Alternate Live and Split each time round, unless the visitor picked one.
        if (!userPicked) setMode(mode === 'live' ? 'split' : 'live');
      }
    })();
  }
}

/* ---------- Light / dark screenshot ---------- */
const shot = document.getElementById('shot');
for (const b of document.querySelectorAll('[data-shot]')) {
  b.addEventListener('click', () => {
    for (const o of document.querySelectorAll('[data-shot]')) o.setAttribute('aria-selected', String(o === b));
    shot.style.opacity = '0.3';
    const img = new Image();
    img.onload = () => {
      shot.src = img.src;
      shot.style.opacity = '1';
    };
    img.src = `img/split-${b.dataset.shot}.png`;
  });
}

/* ---------- Downloads: the right installer from the latest release ---------- */
const ua = navigator.userAgent;
const os = /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'mac' : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? 'linux' : null;
const osName = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
const releasesPage = `https://github.com/${REPO}/releases/latest`;

const pick = {
  windows: (a) => a.find((x) => /x64-setup\.exe$/i.test(x.name)) ?? a.find((x) => /\.exe$/i.test(x.name)),
  mac: (a) => a.find((x) => /universal\.dmg$/i.test(x.name)) ?? a.find((x) => /\.dmg$/i.test(x.name)),
  linux: (a) => a.find((x) => /\.AppImage$/i.test(x.name)),
};

function setDownloads(release) {
  const assets = release?.assets ?? [];
  for (const card of document.querySelectorAll('.platform')) {
    const asset = release ? pick[card.dataset.os](assets) : null;
    card.href = asset ? asset.browser_download_url : releasesPage;
    if (!release) card.classList.add('disabled');
    if (card.dataset.os === os) card.classList.add('mine');
  }
  const label = release ? (os ? `Download for ${osName[os]}` : 'Download free') : 'Downloads open soon';
  for (const l of document.querySelectorAll('[data-download-label]')) l.textContent = label;
  const fine = document.querySelector('[data-download-fine]');
  const note = document.querySelector('[data-release-note]');
  if (release) {
    const mine = os ? pick[os](assets) : null;
    for (const a of document.querySelectorAll('[data-download]')) a.href = mine ? mine.browser_download_url : '#download';
    if (fine) fine.textContent = `Version ${release.tag_name.replace(/^v/, '')} · Free · Also for ${Object.entries(osName).filter(([k]) => k !== os).map(([, v]) => v).join(' and ')}`;
  } else {
    if (fine) fine.textContent = 'The first release is almost here. Star the project on GitHub to hear about it.';
    if (note) note.textContent = 'The first release is almost here. Until then you can build CalmMD from source.';
    for (const t of document.querySelectorAll('.launch-only')) t.remove();
  }
}

fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  .then((r) => (r.ok ? r.json() : null))
  .then(setDownloads, () => setDownloads(null));

// Star count next to the GitHub link, once there are a few.
fetch(`https://api.github.com/repos/${REPO}`)
  .then((r) => (r.ok ? r.json() : null))
  .then((repo) => {
    const n = repo?.stargazers_count ?? 0;
    if (n < 5) return;
    const el = document.querySelector('.gh .stars');
    el.textContent = `★ ${n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n}`;
    el.hidden = false;
  })
  .catch(() => {});

document.getElementById('year').textContent = `© ${new Date().getFullYear()}`;
