/** A Hunspell dictionary known to the Rust spell service. */
export interface SpellDictionary {
  id: string;
  label: string;
  /** BCP 47 tags this dictionary can check; the first is the canonical one. */
  languages: string[];
  license: string;
  /** True for built-ins and dictionaries downloaded earlier. */
  installed: boolean;
  /** True when the dictionary is compiled into the app. */
  bundled: boolean;
  source: string;
}

/** Marks a Spelling Language menu entry that downloads a dictionary before selecting it. */
export const DOWNLOAD_MARK = '↓';
/** Marks a Spelling Language menu entry that can be used immediately. */
export const AVAILABLE_MARK = '✓';
