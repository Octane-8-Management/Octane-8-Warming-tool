export function OctaneLogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="octane-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6BA8F0" />
          <stop offset="100%" stopColor="#3B7FDB" />
        </linearGradient>
        {/* True transparent holes (via mask) instead of a solid fill matching
            one background color, so this renders correctly anywhere. A
            thinner ring + more separated circles reads clearly as two rings
            even at small sidebar/favicon sizes — a thick ring collapses into
            a solid pill once scaled down. */}
        <mask id="octane-logo-mask">
          <rect x="0" y="0" width="64" height="64" fill="#ffffff" />
          <circle cx="19" cy="32" r="10.5" fill="#000000" />
          <circle cx="45" cy="32" r="10.5" fill="#000000" />
        </mask>
      </defs>
      <g mask="url(#octane-logo-mask)">
        <circle cx="19" cy="32" r="18" fill="url(#octane-logo-gradient)" />
        <circle cx="45" cy="32" r="18" fill="url(#octane-logo-gradient)" />
      </g>
    </svg>
  );
}
