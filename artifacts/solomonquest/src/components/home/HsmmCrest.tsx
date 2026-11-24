import { useId, useState } from "react";

/** Seal frame for Harvest School of Ministries and Missions. HSMM has no logo
 *  yet, so the center holds an education photo. Underneath it sits a gold
 *  open-book illustration, which shows through if the photo can't load. */
const CENTER_PHOTO =
  "https://images.unsplash.com/photo-1507842217343-583bb7270b66?q=80&w=800&auto=format&fit=crop";

export function HsmmCrest({ className = "" }: { className?: string }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  // The crest is rendered more than once on the home page (hero slide and
  // HSMM section). SVG ids are document-global, so shared ids made iOS Safari
  // resolve the gradient/clip/text paths to the copy inside the hidden slide,
  // leaving the visible crest with no gold ring, no lettering and an unclipped
  // square. Each instance gets its own ids.
  const uid = "hsmm" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `${uid}-${name}`;
  return (
    <div className={`relative ${className}`} role="img" aria-label="Harvest School of Ministries and Missions">
    <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <path id={id("ring-top")} d="M 40 160 A 120 120 0 0 1 280 160" />
        <path id={id("ring-bottom")} d="M 36 160 A 124 124 0 0 0 284 160" />
        <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(40 62% 72%)" />
          <stop offset="55%" stopColor="hsl(39 52% 56%)" />
          <stop offset="100%" stopColor="hsl(36 48% 42%)" />
        </linearGradient>
        <radialGradient id={id("glow")} cx="50%" cy="38%" r="60%">
          <stop offset="0%" stopColor="hsl(40 70% 70% / 0.55)" />
          <stop offset="100%" stopColor="hsl(40 70% 70% / 0)" />
        </radialGradient>
        <clipPath id={id("center")}>
          <circle cx="160" cy="160" r="95" />
        </clipPath>
      </defs>

      <circle cx="160" cy="160" r="150" fill="none" stroke={`url(#${id("gold")})`} strokeWidth="1.5" opacity="0.9" />
      <circle cx="160" cy="160" r="141" fill="none" stroke={`url(#${id("gold")})`} strokeWidth="0.75" opacity="0.6" />
      <text fill={`url(#${id("gold")})`} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="15" letterSpacing="5" fontWeight="600">
        <textPath href={`#${id("ring-top")}`} startOffset="50%" textAnchor="middle">HARVEST SCHOOL OF</textPath>
      </text>
      <text fill={`url(#${id("gold")})`} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="15" letterSpacing="5" fontWeight="600" dominantBaseline="hanging">
        <textPath href={`#${id("ring-bottom")}`} startOffset="50%" textAnchor="middle">MINISTRIES &amp; MISSIONS</textPath>
      </text>
      <circle cx="40" cy="160" r="2.5" fill={`url(#${id("gold")})`} />
      <circle cx="280" cy="160" r="2.5" fill={`url(#${id("gold")})`} />

      <g clipPath={`url(#${id("center")})`}>
        {/* Fallback illustration: an open book with light rising from it. */}
        <rect x="64" y="64" width="192" height="192" fill="hsl(222 44% 9%)" />
        <circle cx="160" cy="150" r="90" fill={`url(#${id("glow")})`} />
        <g stroke={`url(#${id("gold")})`} strokeLinecap="round" opacity="0.75">
          {[-60, -38, -18, 0, 18, 38, 60].map((deg) => (
            <line key={deg} x1="160" y1="150" x2="160" y2="96" strokeWidth={deg === 0 ? 1.6 : 1} transform={`rotate(${deg} 160 150)`} />
          ))}
        </g>
        <g fill="none" stroke={`url(#${id("gold")})`} strokeWidth="2" strokeLinejoin="round">
          <path d="M160 160 C 140 148, 116 148, 100 154 L 100 202 C 116 196, 140 196, 160 208 Z" fill="hsl(222 44% 12%)" />
          <path d="M160 160 C 180 148, 204 148, 220 154 L 220 202 C 204 196, 180 196, 160 208 Z" fill="hsl(222 44% 12%)" />
          <path d="M112 166 C 126 162, 142 163, 152 168 M112 178 C 126 174, 142 175, 152 180 M112 190 C 126 186, 142 187, 152 192" strokeWidth="1" opacity="0.7" />
          <path d="M208 166 C 194 162, 178 163, 168 168 M208 178 C 194 174, 178 175, 168 180 M208 190 C 194 186, 178 187, 168 192" strokeWidth="1" opacity="0.7" />
        </g>
      </g>
    </svg>
    {/* The photo is an HTML <img> rather than an SVG <image>, so a failed load
        can hide itself and let the illustration show instead of a broken icon. */}
    {!photoFailed && (
      <div className="absolute left-[20.3%] top-[20.3%] h-[59.4%] w-[59.4%] overflow-hidden rounded-full">
        <img
          src={CENTER_PHOTO}
          alt=""
          loading="lazy"
          onError={() => setPhotoFailed(true)}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(222_44%_10%/0.05)] to-[hsl(222_44%_8%/0.45)]" />
      </div>
    )}
    <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true">
      <defs>
        <linearGradient id={id("gold-ring")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(40 62% 72%)" />
          <stop offset="55%" stopColor="hsl(39 52% 56%)" />
          <stop offset="100%" stopColor="hsl(36 48% 42%)" />
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r="96" fill="none" stroke={`url(#${id("gold-ring")})`} strokeWidth="1.5" />
    </svg>
    </div>
  );
}
