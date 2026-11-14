import type { JSX } from 'solid-js';

/** 16px stroke icons for formatting commands, drawn for CalmMD. Keyed by command id. */
const svg = (children: JSX.Element) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.45"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const text = (label: string, weight = 700, style: 'normal' | 'italic' = 'normal', size = 11) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <text x="8" y="12" text-anchor="middle" font-size={String(size)} font-weight={String(weight)} font-style={style} fill="currentColor" font-family="var(--font-ui)">
      {label}
    </text>
  </svg>
);

export const FORMAT_ICONS: Record<string, () => JSX.Element> = {
  'format.bold': () => text('B', 750),
  'format.italic': () => text('I', 500, 'italic', 12),
  'format.strike': () => (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <text x="8" y="12" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor" font-family="var(--font-ui)">
        S
      </text>
      <path d="M3 8h10" stroke="currentColor" stroke-width="1.3" />
    </svg>
  ),
  'format.code': () => svg(<path d="M6 4.5L2.5 8 6 11.5M10 4.5L13.5 8 10 11.5" />),
  'format.link': () =>
    svg(
      <>
        <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6" />
        <path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6" />
      </>,
    ),
  'format.heading1': () => text('H1', 700, 'normal', 9.5),
  'format.heading2': () => text('H2', 700, 'normal', 9.5),
  'format.heading3': () => text('H3', 700, 'normal', 9.5),
  'format.bulletList': () =>
    svg(
      <>
        <path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" />
        <circle cx="3" cy="4.5" r=".6" fill="currentColor" />
        <circle cx="3" cy="8" r=".6" fill="currentColor" />
        <circle cx="3" cy="11.5" r=".6" fill="currentColor" />
      </>,
    ),
  'format.orderedList': () =>
    svg(
      <>
        <path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" />
        <path d="M2.4 3.6l.9-.5v3M2.3 9.3c.2-.5 1.6-.6 1.6.3 0 .7-1.6 1.2-1.6 2.1h1.7" stroke-width="1" />
      </>,
    ),
  'format.taskList': () =>
    svg(
      <>
        <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
        <path d="M5.3 8.2l1.9 1.9 3.6-4" />
      </>,
    ),
  'format.quote': () => svg(<path d="M3.5 3.5v9M7 5h6M7 8h6M7 11h4" />),
  'format.clear': () => svg(<path d="M4 3.5h8M8 3.5l-2 9M3 13l10-10" />),
  'insert.codeBlock': () =>
    svg(
      <>
        <rect x="2" y="2.5" width="12" height="11" rx="2" />
        <path d="M6.3 6.3L4.6 8l1.7 1.7M9.7 6.3L11.4 8 9.7 9.7" />
      </>,
    ),
  'insert.table': () =>
    svg(
      <>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <path d="M2 6.5h12M2 9.8h12M6.5 3v10" />
      </>,
    ),
  'insert.image': () =>
    svg(
      <>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <circle cx="5.8" cy="6.4" r="1.1" />
        <path d="M2.5 12l3.6-3.6 2.6 2.4 1.9-1.8L13.5 12" />
      </>,
    ),
  'insert.hr': () => svg(<path d="M2.5 8h11" />),
  'insert.math': () => text('∑', 500, 'normal', 12),
  'insert.footnote': () => text('¹', 700, 'normal', 13),
  'format.highlight': () =>
    svg(
      <>
        <path d="M9.6 2.2l3.2 3.2-5.6 5.6H4V7.8z" />
      </>,
    ),
  'format.textColor': () => (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.6 11.2L8 2.8l3.4 8.4M5.8 8.4h4.4" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  ),
  'insert.mermaid': () =>
    svg(
      <>
        <rect x="1.8" y="2.5" width="4.6" height="3.6" rx="1" />
        <rect x="9.6" y="9.9" width="4.6" height="3.6" rx="1" />
        <path d="M4.1 6.1v2.6a1.2 1.2 0 0 0 1.2 1.2h4.3" />
        <path d="M8.3 8.6l1.3 1.3-1.3 1.3" />
      </>,
    ),
  'edit.undo': () => svg(<path d="M5.5 3.5L2.5 6.5l3 3M2.8 6.5h6.7a3.5 3.5 0 0 1 0 7H7" />),
  'edit.redo': () => svg(<path d="M10.5 3.5l3 3-3 3M13.2 6.5H6.5a3.5 3.5 0 0 0 0 7H9" />),
  'edit.find': () =>
    svg(
      <>
        <circle cx="7" cy="7" r="4.2" />
        <path d="M10.2 10.2l3.3 3.3" />
      </>,
    ),
  'format.headingMenu': () => (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
      <text x="7" y="12" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="var(--font-ui)">
        H
      </text>
      <path d="M15 7l2.5 2.5L20 7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  ),
};

export const TOOLBAR_CANDIDATES = Object.keys(FORMAT_ICONS);
