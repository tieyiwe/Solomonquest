/**
 * SolomonQuest platform mark ("Sovereign"): a serif S beneath a three-point
 * crown, for Solomon, the king who asked for wisdom. The artwork matches
 * public/favicon.svg and public/logo-*.svg.
 *
 * - <BrandSymbol>: crown + S only. The S takes `currentColor`, so it follows
 *   the text colour (navy on light, ivory on dark); the crown is always gold.
 * - <BrandTile>: the app-icon form (gold crown and S on a navy rounded
 *   square), used where the old "S" circle / graduation-cap tiles were.
 */

const S_PATH =
  "M15.29 -38.7Q17.98 -38.7 20.89 -37.77Q23.8 -36.85 24.19 -36.85Q24.92 -36.85 25.31 -37.27Q25.7 -37.69 25.98 -38.75H27.66V-26.6H26.1Q24.47 -31.92 21.59 -34.44Q18.7 -36.96 15.29 -36.96Q12.43 -36.96 10.78 -35.45Q9.13 -33.94 9.13 -31.36Q9.13 -29.34 10.33 -28.03Q11.54 -26.71 14.9 -25.03L23.13 -20.94Q25.82 -19.6 27.55 -16.74Q29.29 -13.89 29.29 -10.75Q29.29 -5.49 25.45 -2.21Q21.62 1.06 15.4 1.06Q12.38 1.06 9.38 0.11Q6.38 -0.84 5.82 -0.84Q4.59 -0.84 4.14 1.06H2.52V-12.77H4.14Q7.06 -0.78 15.57 -0.78Q18.82 -0.78 20.72 -2.52Q22.62 -4.26 22.62 -7.17Q22.62 -9.35 21.34 -10.75Q20.05 -12.15 16.35 -13.89L12.6 -15.68Q7.62 -18.09 5.32 -20.86Q3.02 -23.63 3.02 -27.33Q3.02 -32.65 6.3 -35.67Q9.58 -38.7 15.29 -38.7Z";

/** Detailed crown (jewel dots + band) for sizes from ~28px up. */
function CrownDetailed({ fill }: { fill: string }) {
  return (
    <g fill={fill}>
      <path d="M19.5 13.2 L18.2 6.4 L25.4 10.2 L32 4.2 L38.6 10.2 L45.8 6.4 L44.5 13.2 Z" />
      <rect x="19.5" y="14.4" width="25" height="2.2" rx="0.6" />
      <circle cx="18.2" cy="5" r="1.5" />
      <circle cx="32" cy="2.6" r="1.6" />
      <circle cx="45.8" cy="5" r="1.5" />
    </g>
  );
}

export function BrandSymbol({
  className = "h-8 w-8",
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <CrownDetailed fill="#c9a054" />
      <path fill="currentColor" transform="translate(16.1 58.94)" d={S_PATH} />
    </svg>
  );
}

export function BrandTile({
  className = "h-8 w-8",
  rounded = "rounded-lg",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center bg-[#141d33] ring-1 ring-[#c9a054]/35 shadow-sm shrink-0 ${rounded} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="h-[78%] w-[78%]">
        <g transform="translate(32 32) scale(0.92) translate(-32 -32.5)">
          <CrownDetailed fill="#e3c98f" />
          <path fill="#c9a054" transform="translate(16.1 58.94)" d={S_PATH} />
        </g>
      </svg>
    </span>
  );
}
