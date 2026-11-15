import { describe, expect, it } from 'vitest';
import { splitResults } from './spelling';

describe('splitResults', () => {
  it('maps offsets in the joined text back to each line', () => {
    const lines = ['I recieve mail', 'teh end', 'fine'];
    // "recieve" at 2..9, "teh" at 15..18 (line 2 starts at 15).
    expect(splitResults(lines, [[15, 18], [2, 9]])).toEqual([
      [0, 2, 9],
      [1, 0, 3],
    ]);
  });
  it('clips a range at the end of its line and drops empty ones', () => {
    expect(splitResults(['ab', 'cd'], [[1, 5], [2, 2]])).toEqual([[0, 1, 2]]);
  });
});
