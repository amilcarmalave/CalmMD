export type Eol = '\n' | '\r\n';

export interface DecodedText {
  text: string;
  eol: Eol;
  bom: boolean;
}

/** Normalise file contents for the editor while remembering how to write them back. */
export function decodeFromDisk(raw: string): DecodedText {
  const bom = raw.charCodeAt(0) === 0xfeff;
  const body = bom ? raw.slice(1) : raw;
  const crlf = countOf(body, '\r\n');
  const lf = countOf(body, '\n') - crlf;
  return {
    text: body.replace(/\r\n?/g, '\n'),
    eol: crlf > lf ? '\r\n' : '\n',
    bom,
  };
}

export function encodeForDisk(text: string, eol: Eol, bom: boolean): string {
  const body = eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
  return bom ? '﻿' + body : body;
}

function countOf(s: string, needle: string): number {
  let n = 0;
  let i = s.indexOf(needle);
  while (i !== -1) {
    n++;
    i = s.indexOf(needle, i + needle.length);
  }
  return n;
}

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * The smallest single replacement turning `a` into `b` (common prefix/suffix trimmed).
 * Used when reloading a file that changed on disk, so the cursor and scroll stay put.
 */
export function minimalChange(a: string, b: string): TextChange | null {
  if (a === b) return null;
  const max = Math.min(a.length, b.length);
  let start = 0;
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}
