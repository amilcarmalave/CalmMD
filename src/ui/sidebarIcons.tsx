/** Sidebar icons (16px, stroke). */
const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.35,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': true,
} as const;

export const IconChevron = () => (
  <svg {...base}>
    <path d="M6 4l4 4-4 4" />
  </svg>
);
export const IconFolder = () => (
  <svg {...base}>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.6h4.9A1.5 1.5 0 0 1 14 6.1v5.4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
  </svg>
);
export const IconFile = () => (
  <svg {...base}>
    <path d="M4 2.5h5l3 3v8a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5z" />
    <path d="M9 2.5v3h3" />
  </svg>
);
export const IconStar = (p: { filled?: boolean }) => (
  <svg {...base} fill={p.filled ? 'currentColor' : 'none'}>
    <path d="M8 2.3l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11l-3.4 1.8.7-3.8-2.8-2.7 3.8-.5z" />
  </svg>
);
export const IconPlusFile = () => (
  <svg {...base}>
    <path d="M4 2.5h5l3 3v8a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5z" />
    <path d="M8 7.5v4M6 9.5h4" />
  </svg>
);
export const IconPlusFolder = () => (
  <svg {...base}>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.6h4.9A1.5 1.5 0 0 1 14 6.1v5.4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
    <path d="M8 7v4M6 9h4" />
  </svg>
);
export const IconSidebar = () => (
  <svg {...base}>
    <rect x="2.5" y="3" width="11" height="10" rx="2" />
    <path d="M6.5 3v10" />
  </svg>
);
