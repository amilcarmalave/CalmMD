/** Minimal 16px stroke icons, drawn for CalmMD. */
const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.4,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': true,
} as const;

export const IconSource = () => (
  <svg {...base}>
    <path d="M3 4h10M3 8h7M3 12h9" />
  </svg>
);

export const IconLive = () => (
  <svg {...base}>
    <path d="M3 4h10M3 8h4" />
    <path d="M9.5 9.5l1.5 3 1.2-1.8 1.8-1.2-3-1.5z" />
  </svg>
);

export const IconSplit = () => (
  <svg {...base}>
    <rect x="2.5" y="3" width="11" height="10" rx="2" />
    <path d="M8 3v10" />
  </svg>
);

export const IconPreview = () => (
  <svg {...base}>
    <path d="M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8s-2.3 4.2-6.2 4.2S1.8 8 1.8 8z" />
    <circle cx="8" cy="8" r="1.8" />
  </svg>
);

export const IconType = () => (
  <svg {...base}>
    <path d="M2.5 12.5l3-9 3 9M3.6 9.5h3.8" />
    <path d="M13.5 12.5V9.8a1.9 1.9 0 0 0-3.4-1.1M13.5 11c-.4 1-1.2 1.6-2.2 1.6a1.3 1.3 0 0 1 0-2.6h2.2" />
  </svg>
);

/** Appearance: a painter's palette (colour themes and document styles). */
export const IconPalette = () => (
  <svg {...base}>
    <path d="M8 2.2a5.8 5.8 0 0 0 0 11.6c.9 0 1.4-.6 1.4-1.3 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.7.6-1.3 1.3-1.3h1.5a2.8 2.8 0 0 0 2.8-2.8C14.2 4.7 11.4 2.2 8 2.2z" />
    <circle cx="5" cy="7.4" r=".85" fill="currentColor" stroke="none" />
    <circle cx="7.3" cy="4.9" r=".85" fill="currentColor" stroke="none" />
    <circle cx="10.4" cy="5.2" r=".85" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPlus = () => (
  <svg {...base}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

export const IconUp = () => (
  <svg {...base}>
    <path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7" />
  </svg>
);

export const IconCaret = () => (
  <svg {...base}>
    <path d="M4.5 6.5L8 10l3.5-3.5" />
  </svg>
);

/** The CalmMD mark: a "C" with Markdown's down arrow resting in its opening. */
export const LogoMark = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 1024 1024" aria-hidden="true">
    <rect width="1024" height="1024" rx="232" fill="#1F2A44" />
    <g transform="translate(34 0)">
      <path d="M679 326 A250 250 0 1 0 679 698" fill="none" stroke="#FAF8F4" stroke-width="84" stroke-linecap="round" />
      <path d="M608 410 V604 M546 542 L608 604 L670 542" fill="none" stroke="#E8A23B" stroke-width="66" stroke-linecap="round" stroke-linejoin="round" />
    </g>
  </svg>
);

export const IconCheck = () => (
  <svg {...base}>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);
