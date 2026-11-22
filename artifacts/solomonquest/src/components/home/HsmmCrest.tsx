/** Typographic seal for Harvest School of Ministries and Missions. Pure SVG +
 *  brand tokens so it renders crisply at any size with no image asset. */
export function HsmmCrest({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 320" className={className} role="img" aria-label="HSMM — Harvest School of Ministries and Missions">
      <defs>
        <path id="hsmm-ring-top" d="M 40 160 A 120 120 0 0 1 280 160" />
        <path id="hsmm-ring-bottom" d="M 36 160 A 124 124 0 0 0 284 160" />
        <linearGradient id="hsmm-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(40 62% 72%)" />
          <stop offset="55%" stopColor="hsl(39 52% 56%)" />
          <stop offset="100%" stopColor="hsl(36 48% 42%)" />
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r="150" fill="none" stroke="url(#hsmm-gold)" strokeWidth="1.5" opacity="0.9" />
      <circle cx="160" cy="160" r="141" fill="none" stroke="url(#hsmm-gold)" strokeWidth="0.75" opacity="0.6" />
      <circle cx="160" cy="160" r="96" fill="hsl(222 44% 9% / 0.6)" stroke="url(#hsmm-gold)" strokeWidth="1.25" />
      <text fill="url(#hsmm-gold)" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="15" letterSpacing="5" fontWeight="600">
        <textPath href="#hsmm-ring-top" startOffset="50%" textAnchor="middle">HARVEST SCHOOL OF</textPath>
      </text>
      <text fill="url(#hsmm-gold)" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="15" letterSpacing="5" fontWeight="600" dominantBaseline="hanging">
        <textPath href="#hsmm-ring-bottom" startOffset="50%" textAnchor="middle">MINISTRIES &amp; MISSIONS</textPath>
      </text>
      <circle cx="40" cy="160" r="2.5" fill="url(#hsmm-gold)" />
      <circle cx="280" cy="160" r="2.5" fill="url(#hsmm-gold)" />
      {/* Wheat-ear mark: the harvest */}
      <g transform="translate(160 118)" fill="url(#hsmm-gold)">
        <rect x="-0.75" y="-2" width="1.5" height="26" rx="0.75" />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(0 ${i * 6})`}>
            <ellipse cx="-4.5" cy="0" rx="2.6" ry="5.2" transform="rotate(-28 -4.5 0)" />
            <ellipse cx="4.5" cy="0" rx="2.6" ry="5.2" transform="rotate(28 4.5 0)" />
          </g>
        ))}
        <ellipse cx="0" cy="-6" rx="2.4" ry="5" />
      </g>
      <text x="160" y="182" textAnchor="middle" fill="hsl(40 30% 96%)" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="46" fontWeight="600" letterSpacing="4">
        HSMM
      </text>
      <line x1="122" y1="196" x2="198" y2="196" stroke="url(#hsmm-gold)" strokeWidth="1" />
    </svg>
  );
}
