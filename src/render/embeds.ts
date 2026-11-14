/**
 * Video embeds. In the file they're plain image syntax with a recognised URL:
 * `![Talk](https://youtu.be/ID)`. Other Markdown apps show a link or broken image, so the file stays
 * portable. CalmMD renders a quiet card that loads the player only when clicked: no third-party
 * requests until then, and YouTube uses the privacy-enhanced youtube-nocookie.com domain.
 */
export type Embed =
  | { kind: 'youtube'; id: string; start: number }
  | { kind: 'vimeo'; id: string }
  | { kind: 'video'; src: string };

const VIDEO_EXT = /\.(mp4|webm|m4v|mov|ogv|ogg)(\?.*)?$/i;

function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

export function parseEmbed(src: string): Embed | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    // Relative paths: only local video files embed.
    return VIDEO_EXT.test(src) ? { kind: 'video', src } : null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const t = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return /^[\w-]{6,}$/.test(id) ? { kind: 'youtube', id, start: t } : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    const id =
      url.searchParams.get('v') ?? /^\/(?:embed|shorts|live|v)\/([\w-]+)/.exec(url.pathname)?.[1] ?? null;
    return id && /^[\w-]{6,}$/.test(id) ? { kind: 'youtube', id, start: t } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /\/(?:video\/)?(\d+)/.exec(url.pathname)?.[1];
    return id ? { kind: 'vimeo', id } : null;
  }
  if ((url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'file:') && VIDEO_EXT.test(url.pathname))
    return { kind: 'video', src };
  return null;
}

/** True when the text is a single URL worth offering as an embed (used on paste). */
export function isEmbeddableUrl(text: string): boolean {
  const t = text.trim();
  return /^https?:\/\/\S+$/.test(t) && parseEmbed(t) !== null;
}

export function embedPlayerUrl(e: Exclude<Embed, { kind: 'video' }>, autoplay = true): string {
  const auto = autoplay ? 'autoplay=1&' : '';
  if (e.kind === 'youtube') return `https://www.youtube-nocookie.com/embed/${e.id}?${auto}rel=0${e.start ? `&start=${e.start}` : ''}`;
  return `https://player.vimeo.com/video/${e.id}?${auto}dnt=1`;
}

export function embedPageUrl(e: Exclude<Embed, { kind: 'video' }>): string {
  return e.kind === 'youtube' ? `https://www.youtube.com/watch?v=${e.id}${e.start ? `&t=${e.start}s` : ''}` : `https://vimeo.com/${e.id}`;
}

/** Replaces a click-to-load card with the real player. */
export function activateEmbed(card: HTMLElement) {
  const kind = card.dataset.embedKind as 'youtube' | 'vimeo';
  const id = card.dataset.embedId!;
  const start = Number(card.dataset.embedStart ?? 0);
  const iframe = document.createElement('iframe');
  iframe.src = embedPlayerUrl(kind === 'youtube' ? { kind, id, start } : { kind, id });
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.title = card.dataset.embedTitle || 'Video';
  iframe.className = 'embed-frame';
  card.replaceChildren(iframe);
  card.classList.add('embed-active');
}
