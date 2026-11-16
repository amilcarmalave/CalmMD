import { describe, expect, it } from 'vitest';
import { headingLine, headingsOf } from './headings';

describe('headings', () => {
  const note = '# Trip\n\nIntro\n\n## The **Budget**\n\n```\n# not a heading\n```\n\n### Day 1: Alfama ##\n';

  it('lists headings outside code, as plain text with GitHub anchors', () => {
    expect(headingsOf(note).map((h) => [h.level, h.text, h.slug, h.line])).toEqual([
      [1, 'Trip', 'trip', 0],
      [2, 'The Budget', 'the-budget', 4],
      [3, 'Day 1: Alfama', 'day-1-alfama', 10],
    ]);
  });

  it('finds the line an anchor points to', () => {
    expect(headingLine(note, 'the-budget')).toBe(4);
    expect(headingLine(note, 'Day%201%3A%20Alfama')).toBe(10);
    expect(headingLine(note, 'missing')).toBeNull();
  });
});
