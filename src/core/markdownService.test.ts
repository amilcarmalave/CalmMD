// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createMarkdownService } from './markdownService';
import { createMemoryPlatform } from '../platform/memory';

describe('markdownService', () => {
  const platform = createMemoryPlatform();
  const service = createMarkdownService(platform);

  it('parses headings and source blocks', async () => {
    const result = await service.parse('---\ntitle: Test\n---\n\n# Hello\n\nText\n');
    expect(result.frontMatter).toEqual({ title: 'Test' });
    expect(result.headings).toHaveLength(1);
    expect(result.headings[0]).toMatchObject({ level: 1, text: 'Hello', id: 'hello', line: 4 });
    expect(result.blocks.some((b) => b.kind === 'Heading')).toBe(true);
  });

  it('renders HTML through the platform', async () => {
    const result = await service.render('# Hello\n');
    expect(result.html).toContain('Hello');
    expect(result.sourceMap).toHaveLength(1);
  });

  it('highlights code through the platform', async () => {
    const result = await service.highlightCode('rust', 'fn main() {}');
    expect(result.html).toContain('<pre');
    expect(result.html).toContain('fn main');
  });
});
