// Inline Lucide-style stroke icons. currentColor, 24px viewBox, no fills.
const svg = (inner, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  sun: svg('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>'),
  bookOpen: svg('<path d="M12 5.5C10 3.9 7.3 3.5 4.5 3.8c-.6.1-1 .6-1 1.2v12.6c0 .7.6 1.2 1.3 1.2 2.5-.2 5.2.2 7.2 1.7 2-1.5 4.7-1.9 7.2-1.7.7 0 1.3-.5 1.3-1.2V5c0-.6-.4-1.1-1-1.2-2.8-.3-5.5.1-7.5 1.7Z"/><path d="M12 5.5v14.7"/>'),
  cards: svg('<rect x="3" y="6.5" width="13" height="14" rx="2.5" transform="rotate(-8 9.5 13.5)"/><rect x="8.5" y="4" width="13" height="14" rx="2.5" transform="rotate(6 15 11)"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.8 7.8 0 0 0-2.6-1.5L14 2.5h-4L9.6 5a7.8 7.8 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.8 7.8 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.8 7.8 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.8 7.8 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z"/>'),
  sparkles: svg('<path d="M12 3.5l1.7 5a2 2 0 0 0 1.3 1.3l5 1.7-5 1.7a2 2 0 0 0-1.3 1.3l-1.7 5-1.7-5a2 2 0 0 0-1.3-1.3l-5-1.7 5-1.7a2 2 0 0 0 1.3-1.3l1.7-5Z"/><path d="M19.5 3v3M18 4.5h3"/>'),
  phone: svg('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
  list: svg('<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><path d="M3.5 6.5h.01M3.5 12h.01M3.5 17.5h.01" stroke-width="2.6"/>'),
  keyboard: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9.5 14h5"/>'),
  landmark: svg('<path d="M3.5 21h17M5.5 17.5V10M9.8 17.5V10M14.2 17.5V10M18.5 17.5V10M12 2.8l8.5 4.7h-17L12 2.8Z"/>'),
  trophy: svg('<path d="M8 21h8M12 17.5V21M7 4h10v5.5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.5a0 0 0 0 0 0 0c0 2.5 1 4 2.9 4.4M17 6h2.5c0 2.5-1 4-2.9 4.4"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18"/>'),
  bell: svg('<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17s-2.5-1-2.5-7"/><path d="M10.2 19.5a2 2 0 0 0 3.6 0"/>'),
  download: svg('<path d="M12 3.5v11M7.5 10l4.5 4.5L16.5 10"/><path d="M4 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-2.5"/>'),
  upload: svg('<path d="M12 14.5v-11M7.5 8L12 3.5 16.5 8"/><path d="M4 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-2.5"/>'),
  trash: svg('<path d="M4 6.5h16M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7M6 6.5l.8 13a1.5 1.5 0 0 0 1.5 1.4h7.4a1.5 1.5 0 0 0 1.5-1.4l.8-13"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>'),
  check: svg('<path d="M4.5 12.5l5 5 10-11"/>'),
  chevron: svg('<path d="m9 5.5 6.5 6.5L9 18.5"/>'),
  swatch: svg('<circle cx="12" cy="12" r="8.5"/>'),
};
