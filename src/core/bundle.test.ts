import { describe, expect, it } from 'vitest';
import { inlineImages, localImages, planZipBundle } from './bundle';
import { crc32, createZip, readStoredZip } from './zip';

describe('zip', () => {
  it('computes CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });
  it('writes a stored archive that reads back, with UTF-8 names', () => {
    const files = [
      { name: 'Café notes.md', data: new TextEncoder().encode('# Hi') },
      { name: 'assets/a.png', data: new Uint8Array([1, 2, 3]) },
    ];
    const zip = createZip(files, new Date(2026, 10, 13, 10, 30));
    const back = readStoredZip(zip);
    expect(back.map((f) => f.name)).toEqual(['Café notes.md', 'assets/a.png']);
    expect([...back[1].data]).toEqual([1, 2, 3]);
    // End of central directory record at the end, with the entry count.
    const v = new DataView(zip.buffer);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });
});

describe('share bundles', () => {
  const text = '![a](assets/a.png) ![b](../pics/a.png) ![c](https://x.com/c.png) ![a again](assets/a.png)';

  it('puts every local image under assets/ with unique names and rewrites links', () => {
    const plan = planZipBundle(text, '/notes/doc.md');
    expect(plan.files).toEqual([
      { from: '/notes/assets/a.png', name: 'assets/a.png' },
      { from: '/pics/a.png', name: 'assets/a-2.png' },
    ]);
    expect(plan.text).toBe('![a](assets/a.png) ![b](assets/a-2.png) ![c](https://x.com/c.png) ![a again](assets/a.png)');
  });

  it('lists local images and inlines them as data URLs', () => {
    expect(localImages(text, '/notes/doc.md')).toEqual(['/notes/assets/a.png', '/pics/a.png']);
    const r = inlineImages(text, '/notes/doc.md', new Map([['/notes/assets/a.png', 'data:image/png;base64,AAA']]));
    expect(r.text).toBe('![a](data:image/png;base64,AAA) ![b](../pics/a.png) ![c](https://x.com/c.png) ![a again](data:image/png;base64,AAA)');
    expect(r.missing).toEqual(['../pics/a.png']);
  });
});
