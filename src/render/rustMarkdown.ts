import { createMarkdownService } from '../core/markdownService';
import { parseAltSize } from '../core/imageSize';
import type { Platform } from '../platform/types';
import { diagramFor } from './diagrams';
import { embedPageUrl, parseEmbed } from './embeds';
import { escapeHtml } from './highlight';
import { PAGE_BREAK, resolveImageSrc, sanitizeMarkdownHtml, type RenderEnv } from './markdown';

const nonce = () => Math.random().toString(36).slice(2, 10);

/**
 * Rust-backed Markdown renderer for the preview.
 *
 * The lazy features that need the webview (relative image URLs, Mermaid, trusted KaTeX markup) stay
 * in TypeScript; Mordant supplies the base HTML and sanitisation uses the same DOMPurify rules as
 * the TypeScript renderer.
 */
export function createRustRenderer(platform: Platform): { render(text: string, env: RenderEnv): Promise<string> } {
  const markdown = createMarkdownService(platform);

  return {
    async render(text, env) {
      const result = await markdown.render(text, {
        highlightCode: true,
        theme: env.theme ?? (env.colorScheme === 'dark' ? 'CalmMD Ink' : 'CalmMD Snow'),
      });

      const doc = document.implementation.createHTMLDocument('');
      doc.body.innerHTML = result.html;
      const trustedHtml: string[] = [];
      const id = nonce();

      for (const code of [...doc.querySelectorAll<HTMLElement>('pre.code-block[data-lang="mermaid"]')]) {
        const source = code.textContent ?? '';
        const result = diagramFor(source, env.colorScheme ?? 'light', env.onAsyncUpdate);
        const attrs = lineAttrs(code);
        let html: string;
        if (result?.svg) {
          html = `<div class="mermaid-block"${attrs}>${trusted(trustedHtml, id, result.svg)}</div>`;
        } else if (result?.error) {
          html = `<div class="mermaid-block mermaid-error"${attrs}><div class="diagram-error">Diagram error: ${escapeHtml(result.error)}</div><pre class="code-block" data-lang="mermaid"><code>${escapeHtml(source)}</code></pre></div>`;
        } else {
          html = `<div class="mermaid-block mermaid-pending"${attrs}><pre class="code-block" data-lang="mermaid"><code>${escapeHtml(source)}</code></pre></div>`;
        }
        code.outerHTML = html;
      }

      for (const image of [...doc.querySelectorAll<HTMLImageElement>('img')]) {
        const raw = image.getAttribute('src') ?? '';
        const embed = parseEmbed(raw);
        if (embed) {
          image.outerHTML = embedCard(raw, embed, image.getAttribute('alt') ?? '', env);
          continue;
        }
        image.setAttribute('src', resolveImageSrc(raw, env));
        const size = parseAltSize(image.getAttribute('alt') ?? '');
        if (size.width) image.setAttribute('width', String(size.width));
        if (size.height) image.setAttribute('height', String(size.height));
        if (size.align === 'center' || size.align === 'right') image.classList.add(`img-${size.align}`);
        if (size.alt !== (image.getAttribute('alt') ?? '')) image.setAttribute('alt', size.alt);
        image.setAttribute('decoding', 'async');
      }

      for (const paragraph of [...doc.querySelectorAll('p')]) {
        if (!PAGE_BREAK.test((paragraph.textContent ?? '').trim())) continue;
        const breaker = doc.createElement('div');
        breaker.className = 'page-break';
        breaker.setAttribute('aria-hidden', 'true');
        for (const name of ['data-line-start', 'data-line-end']) {
          const value = paragraph.getAttribute(name);
          if (value !== null) breaker.setAttribute(name, value);
        }
        paragraph.replaceWith(breaker);
      }

      const html = sanitizeMarkdownHtml(doc.body.innerHTML);
      if (!trustedHtml.length) return html;
      const slot = new RegExp(`<span data-trusted="${id}-(\\d+)"></span>`, 'g');
      return html.replace(slot, (_, i: string) => trustedHtml[Number(i)] ?? '');
    },
  };
}

function lineAttrs(el: Element): string {
  return ['data-line-start', 'data-line-end']
    .map((name) => {
      const value = el.getAttribute(name);
      return value === null ? '' : ` ${name}="${value}"`;
    })
    .join('');
}

function trusted(out: string[], id: string, html: string): string {
  out.push(html);
  return `<span data-trusted="${id}-${out.length - 1}"></span>`;
}

function embedCard(raw: string, embed: NonNullable<ReturnType<typeof parseEmbed>>, alt: string, env: RenderEnv): string {
  if (embed.kind === 'video') {
    const src = escapeHtml(resolveImageSrc(raw, env));
    return `<span class="embed embed-video"><video controls preload="metadata" src="${src}" title="${escapeHtml(alt)}"></video></span>`;
  }
  const provider = embed.kind === 'youtube' ? 'YouTube' : 'Vimeo';
  const title = escapeHtml(alt || `${provider} video`);
  const start = embed.kind === 'youtube' && embed.start ? ` data-embed-start="${embed.start}"` : '';
  return (
    `<span class="embed embed-card" data-embed-kind="${embed.kind}" data-embed-id="${escapeHtml(embed.id)}"${start} data-embed-title="${title}" data-embed-url="${escapeHtml(embedPageUrl(embed))}">` +
    `<button type="button" class="embed-play" aria-label="Play ${title}">` +
    `<span class="embed-icon" aria-hidden="true"></span><span class="embed-text"><span class="embed-title">${title}</span>` +
    `<span class="embed-provider">${provider} · loads when you click</span></span></button></span>`
  );
}
