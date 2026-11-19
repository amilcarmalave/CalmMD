import { describe, expect, it } from 'vitest';
import { spellingLanguageMenu } from './appMenus';
import { DEFAULT_SETTINGS } from './settings';
import type { SpellDictionary } from '../core/spellDictionaries';

const dictionaries: SpellDictionary[] = [
  { id: 'en_US', label: 'English (US)', languages: ['en-US', 'en'], license: 'MIT', installed: true, bundled: true, source: '' },
  { id: 'de_DE', label: 'German', languages: ['de-DE', 'de'], license: 'Apache-2.0', installed: true, bundled: true, source: '' },
  { id: 'ru_RU', label: 'Russian', languages: ['ru-RU', 'ru'], license: 'BSD-3-Clause', installed: false, bundled: false, source: 'url' },
];

describe('spellingLanguageMenu', () => {
  it('combines available and downloadable dictionaries with one separator', () => {
    const entries = spellingLanguageMenu(DEFAULT_SETTINGS, dictionaries);
    const labels = entries.map((e) => ('label' in e ? e.label : '---'));
    expect(labels).toContain('✓  English (US)');
    expect(labels).toContain('✓  German');
    expect(labels).toContain('↓  Russian — download');
    expect(labels.filter((l) => l === '---')).toHaveLength(1);
    expect(labels.indexOf('---')).toBeGreaterThan(labels.indexOf('✓  German'));
    expect(labels.indexOf('---')).toBeLessThan(labels.indexOf('↓  Russian — download'));
  });

  it('moves a downloaded dictionary into the available group', () => {
    const installed = dictionaries.map((d) => (d.id === 'ru_RU' ? { ...d, installed: true } : d));
    const entries = spellingLanguageMenu(DEFAULT_SETTINGS, installed);
    const labels = entries.map((e) => ('label' in e ? e.label : '---'));
    expect(labels).toContain('✓  Russian');
    expect(labels).not.toContain('↓  Russian — download');
    expect(labels).not.toContain('---');
  });
});
