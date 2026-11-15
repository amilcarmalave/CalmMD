import { describe, expect, it, vi } from 'vitest';
import { spellingItems, wordAt } from './editorMenu';

describe('wordAt', () => {
  it('finds the word around a position, with inner apostrophes and accents', () => {
    expect(wordAt('I recieve mail', 4)).toEqual({ from: 2, to: 9, word: 'recieve' });
    expect(wordAt("it's 'quoted'", 2)).toEqual({ from: 0, to: 4, word: "it's" });
    expect(wordAt("'quoted'", 3)).toEqual({ from: 1, to: 7, word: 'quoted' });
    expect(wordAt('café au lait', 2)?.word).toBe('café');
    expect(wordAt('**bold**', 4)?.word).toBe('bold');
  });
  it('returns null away from words and for numbers alone', () => {
    expect(wordAt('a  b', 2)).toBeNull();
    expect(wordAt('2026', 2)).toBeNull();
  });
});

describe('spellingItems', () => {
  it('lists suggestions that replace the word, then Add to Dictionary', () => {
    const replace = vi.fn();
    const learn = vi.fn();
    const items = spellingItems(['receive', 'relieve'], replace, learn);
    expect(items.map((i) => (typeof i === 'object' && 'label' in i ? i.label : '-'))).toEqual(['receive', 'relieve', 'Add to Dictionary']);
    (items[0] as { action: () => void }).action();
    expect(replace).toHaveBeenCalledWith('receive');
  });
  it('says so when there are no suggestions', () => {
    const items = spellingItems([], () => {}, () => {});
    expect((items[0] as { label: string; disabled?: boolean }).disabled).toBe(true);
  });
});
