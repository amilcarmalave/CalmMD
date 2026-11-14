import { describe, expect, it } from 'vitest';
import { slashQuery } from './slash';

describe('slashQuery', () => {
  it('triggers only at the start of a line', () => {
    expect(slashQuery('/')).toEqual({ start: 0, query: '' });
    expect(slashQuery('  /tab')).toEqual({ start: 2, query: 'tab' });
    expect(slashQuery('text /tab')).toBeNull();
    expect(slashQuery('/tab le')).toBeNull(); // a space ends it
    expect(slashQuery('https://')).toBeNull();
  });
});
