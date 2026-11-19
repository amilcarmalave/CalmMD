import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF } from './build';
import { adaptHtmlForTakumi, takumiOptions } from './takumi';

describe('takumiOptions', () => {
  it('maps page size, margins and metadata', () => {
    const options = takumiOptions({ title: 'Notes', pdf: { ...DEFAULT_PDF, pageSize: 'A5', margins: 'wide' } });
    expect(options.size).toBe('a5');
    expect(options.margin).toEqual({ top: 113, right: 106, bottom: 121, left: 106 });
    expect(options.metadata).toEqual({ title: 'Notes', creator: 'CalmMD' });
    expect(options.outline).toBe(true);
  });

  it('uses Takumi page-counter classes for the default footer', () => {
    const options = takumiOptions({ title: 'Notes', pdf: DEFAULT_PDF });
    expect(options.header).toContain('Notes');
    expect(options.footer).toContain('class="pageNumber"');
    expect(options.footer).toContain('class="totalPages"');
    expect(options.pages.first.header).toBe(false);
    expect(options.pages.first.footer).toBeUndefined();
  });

  it('honours minimal and disabled running elements', () => {
    const minimal = takumiOptions({ title: 'Notes', pdf: { ...DEFAULT_PDF, template: 'minimal' } });
    expect(minimal.header).toBe(false);
    expect(minimal.footer).toContain('class="pageNumber"');
    expect(minimal.footer).not.toContain('class="totalPages"');
    const none = takumiOptions({ title: 'Notes', pdf: { ...DEFAULT_PDF, header: false, pageNumbers: false } });
    expect(none.header).toBe(false);
    expect(none.footer).toBe(false);
  });

  it('adapts control glyphs and applies the adjustable body weight', () => {
    const options = takumiOptions({ title: 'Notes', pdf: DEFAULT_PDF, cover: true });
    const html = adaptHtmlForTakumi(
      '<html><head></head><body><a href="#x"><span class="toc-dots"></span></a>' +
        '<input type="checkbox" class="task-checkbox" checked="" disabled="">Check</body></html>',
      options,
    );
    expect(html).toContain('targetPageNumber');
    expect(html).toContain('task-checkbox" style=');
    expect(html).toContain('<style>.md-body { font-weight: 350; }</style>');
  });

  it('suppresses the footer on a cover page', () => {
    const options = takumiOptions({ title: 'Notes', pdf: DEFAULT_PDF, cover: true });
    expect(options.pages.first.footer).toBe(false);
  });
});
