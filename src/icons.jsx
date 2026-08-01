// Inline Lucide-style stroke icons. currentColor, 24px viewBox, no fills.
const Icon = ({ children, className = '' }) => (
  <svg
    className={`icon ${className}`.trim()}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const SunIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" />
  </Icon>
);

export const BookOpenIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5.5C10 3.9 7.3 3.5 4.5 3.8c-.6.1-1 .6-1 1.2v12.6c0 .7.6 1.2 1.3 1.2 2.5-.2 5.2.2 7.2 1.7 2-1.5 4.7-1.9 7.2-1.7.7 0 1.3-.5 1.3-1.2V5c0-.6-.4-1.1-1-1.2-2.8-.3-5.5.1-7.5 1.7Z" />
    <path d="M12 5.5v14.7" />
  </Icon>
);

export const CardsIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="6.5" width="13" height="14" rx="2.5" transform="rotate(-8 9.5 13.5)" />
    <rect x="8.5" y="4" width="13" height="14" rx="2.5" transform="rotate(6 15 11)" />
  </Icon>
);

export const GearIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.8 7.8 0 0 0-2.6-1.5L14 2.5h-4L9.6 5a7.8 7.8 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.8 7.8 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.8 7.8 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.8 7.8 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z" />
  </Icon>
);

export const SparklesIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.5l1.7 5a2 2 0 0 0 1.3 1.3l5 1.7-5 1.7a2 2 0 0 0-1.3 1.3l-1.7 5-1.7-5a2 2 0 0 0-1.3-1.3l-5-1.7 5-1.7a2 2 0 0 0 1.3-1.3l1.7-5Z" />
    <path d="M19.5 3v3M18 4.5h3" />
  </Icon>
);

export const PhoneIcon = (p) => (
  <Icon {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </Icon>
);

export const ListIcon = (p) => (
  <Icon {...p}>
    <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
    <path d="M3.5 6.5h.01M3.5 12h.01M3.5 17.5h.01" strokeWidth="2.6" />
  </Icon>
);

export const KeyboardIcon = (p) => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9.5 14h5" />
  </Icon>
);

export const LandmarkIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 21h17M5.5 17.5V10M9.8 17.5V10M14.2 17.5V10M18.5 17.5V10M12 2.8l8.5 4.7h-17L12 2.8Z" />
  </Icon>
);

export const TrophyIcon = (p) => (
  <Icon {...p}>
    <path d="M8 21h8M12 17.5V21M7 4h10v5.5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4.5a0 0 0 0 0 0 0c0 2.5 1 4 2.9 4.4M17 6h2.5c0 2.5-1 4-2.9 4.4" />
  </Icon>
);

export const GlobeIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18" />
  </Icon>
);

export const BellIcon = (p) => (
  <Icon {...p}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17s-2.5-1-2.5-7" />
    <path d="M10.2 19.5a2 2 0 0 0 3.6 0" />
  </Icon>
);

export const DownloadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.5v11M7.5 10l4.5 4.5L16.5 10" />
    <path d="M4 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
  </Icon>
);

export const UploadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 14.5v-11M7.5 8L12 3.5 16.5 8" />
    <path d="M4 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
  </Icon>
);

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4 6.5h16M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7M6 6.5l.8 13a1.5 1.5 0 0 0 1.5 1.4h7.4a1.5 1.5 0 0 0 1.5-1.4l.8-13" />
  </Icon>
);

export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </Icon>
);

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Icon>
);

export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ChevronIcon = (p) => (
  <Icon {...p}>
    <path d="m9 5.5 6.5 6.5L9 18.5" />
  </Icon>
);

// Tab bar glyphs
export const TodayTabIcon = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4.2" />
    <path
      d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"
      strokeLinecap="round"
    />
  </svg>
);

export const LibraryTabIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 5.5C10 3.9 7.3 3.5 4.5 3.8c-.6.1-1 .6-1 1.2v12.6c0 .7.6 1.2 1.3 1.2 2.5-.2 5.2.2 7.2 1.7 2-1.5 4.7-1.9 7.2-1.7.7 0 1.3-.5 1.3-1.2V5c0-.6-.4-1.1-1-1.2-2.8-.3-5.5.1-7.5 1.7Z" />
    <path d="M12 5.5v14.7" strokeLinecap="round" />
  </svg>
);

export const PracticeTabIcon = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="6.5" width="13" height="14" rx="2.5" transform="rotate(-8 9.5 13.5)" />
    <rect x="8.5" y="4" width="13" height="14" rx="2.5" transform="rotate(6 15 11)" />
  </svg>
);

export const SettingsTabIcon = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.8 7.8 0 0 0-2.6-1.5L14 2.5h-4L9.6 5a7.8 7.8 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.8 7.8 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.8 7.8 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.8 7.8 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z" />
  </svg>
);

export const MailIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </Icon>
);

export const UserIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" />
  </Icon>
);

export const SignOutIcon = (p) => (
  <Icon {...p}>
    <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
    <path d="m17 8 4 4-4 4" />
    <path d="M21 12H10" />
  </Icon>
);

export const ScrollIcon = (p) => (
  <Icon {...p}>
    <path d="M7 4h11a2 2 0 0 1 2 2v11.5" />
    <path d="M7 4a2 2 0 0 0-2 2v12.5A1.5 1.5 0 0 0 6.5 20H18" />
    <path d="M20 17.5a2.5 2.5 0 0 1-2 2.5" />
    <path d="M9.5 9h6M9.5 12.5h6" />
  </Icon>
);

// Google's multicolor G mark, the one exception to the stroke style.
export const GoogleIcon = ({ className = '' }) => (
  <svg className={`icon google-g ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81Z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3a7.25 7.25 0 0 1-10.8-3.8H1.28v3.1A12 12 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l3.99-3.1Z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.98 11.98 0 0 0 1.28 6.61l3.99 3.1A7.17 7.17 0 0 1 12 4.75Z" />
  </svg>
);

export const SpinnerIcon = ({ className = '' }) => (
  <svg
    className={`icon spinner ${className}`.trim()}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
  </svg>
);
