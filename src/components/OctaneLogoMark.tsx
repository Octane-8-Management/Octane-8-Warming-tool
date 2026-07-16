export function OctaneLogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="octane-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5B9CEB" />
          <stop offset="100%" stopColor="#2E6FD1" />
        </linearGradient>
      </defs>
      <circle cx="23" cy="32" r="21" fill="url(#octane-logo-gradient)" />
      <circle cx="41" cy="32" r="21" fill="url(#octane-logo-gradient)" />
      <circle cx="23" cy="32" r="9.5" fill="#ffffff" />
      <circle cx="41" cy="32" r="9.5" fill="#ffffff" />
    </svg>
  );
}
