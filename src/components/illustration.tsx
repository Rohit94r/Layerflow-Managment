/**
 * Cobalt "engraving" coastline drawn in SVG, after the Riviera print style of the
 * design reference. Colours come from theme tokens so it adapts to dark mode.
 */

// Deterministic pseudo-random so server and client render identically.
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** y of the hillside shoreline at x (a gentle curve falling to the right). */
const shoreY = (x: number) => 300 + Math.pow(x / 1200, 1.6) * 90;

function Town() {
  const houses = [];
  for (let i = 0; i < 46; i++) {
    const x = 10 + i * 19 + rand(i) * 8;
    if (x > 900) break;
    const scale = 1 - x / 1400;
    const w = (18 + rand(i + 1) * 16) * scale;
    const h = (14 + rand(i + 2) * 22) * scale;
    const base = shoreY(x) - 4 - rand(i + 3) * 26 * scale;
    houses.push(
      <g key={i}>
        <rect x={x} y={base - h} width={w} height={h} fill="var(--bg)" stroke="var(--cobalt)" strokeWidth={0.9} />
        <path d={`M${x - 1.5} ${base - h} L${x + w / 2} ${base - h - 5 * scale} L${x + w + 1.5} ${base - h} Z`} fill="var(--cobalt)" opacity={0.85} />
        {Array.from({ length: Math.max(1, Math.floor(w / 7)) }).map((_, j) => (
          <rect key={j} x={x + 2.5 + j * 6.5 * scale} y={base - h + 4 * scale} width={2.2 * scale} height={3.4 * scale} fill="var(--cobalt)" />
        ))}
      </g>,
    );
  }
  return <g>{houses}</g>;
}

function Trees() {
  const trees = [];
  for (let i = 0; i < 38; i++) {
    const x = 20 + i * 24 + rand(i + 50) * 14;
    if (x > 980) break;
    const scale = 1 - x / 1500;
    const y = shoreY(x) + 2 - rand(i + 60) * 8;
    const cypress = rand(i + 70) > 0.72;
    trees.push(
      cypress ? (
        <path key={i} d={`M${x} ${y} q ${3 * scale} ${-14 * scale} 0 ${-30 * scale} q ${-3 * scale} ${16 * scale} 0 ${30 * scale}`} fill="var(--cobalt)" />
      ) : (
        <ellipse key={i} cx={x} cy={y - 6 * scale} rx={9 * scale} ry={7 * scale} fill="url(#ill-hatch-dense)" stroke="var(--cobalt)" strokeWidth={0.8} />
      ),
    );
  }
  return <g>{trees}</g>;
}

function Palm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const fronds = [-80, -55, -30, -10, 10, 32, 58, 85, 120, -120, 150, -150];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 C -6 -60, 6 -120, -2 -190" stroke="var(--cobalt)" strokeWidth={11} fill="none" strokeLinecap="round" />
      {Array.from({ length: 16 }).map((_, i) => (
        <path key={i} d={`M-8 ${-12 * i - 6} l 14 -4`} stroke="var(--bg)" strokeWidth={1.2} />
      ))}
      {fronds.map((a, i) => {
        const r = (a * Math.PI) / 180;
        const len = 92 + (i % 3) * 14;
        const ex = Math.sin(r) * len;
        const ey = -Math.cos(r) * len * 0.55 + Math.abs(Math.sin(r)) * 40;
        return (
          <path
            key={a}
            d={`M-2 -190 Q ${ex * 0.5} ${-190 - 40} ${ex} ${-190 + ey}`}
            stroke="var(--cobalt)"
            strokeWidth={7}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="2 2.5"
          />
        );
      })}
      <circle cx={-2} cy={-190} r={9} fill="var(--cobalt)" />
    </g>
  );
}

export function CoastIllustration({ className, band }: { className?: string; band?: boolean }) {
  // `band` crops to the town, bay and shore for wide, short placements such as the footer.
  return (
    <svg viewBox={band ? "0 170 1200 600" : "0 0 1200 800"} preserveAspectRatio={band ? "xMidYMid slice" : "xMidYMax slice"} className={className} role="img" aria-label="Engraved illustration of a coastal town above a curving bay">
      <defs>
        <pattern id="ill-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--cobalt)" strokeWidth="0.9" opacity="0.55" />
        </pattern>
        <pattern id="ill-hatch-dense" width="3.5" height="3.5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <line x1="0" y1="0" x2="0" y2="3.5" stroke="var(--cobalt)" strokeWidth="1.1" />
        </pattern>
        <pattern id="ill-waves" width="40" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 3.5 q 10 -2.2 20 0 t 20 0" stroke="var(--bg)" strokeWidth="0.8" fill="none" opacity="0.55" />
        </pattern>
        <pattern id="ill-stipple" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r="0.7" fill="var(--cobalt)" opacity="0.35" />
          <circle cx="6.5" cy="7" r="0.6" fill="var(--cobalt)" opacity="0.25" />
        </pattern>
        <pattern id="ill-leaves" width="14" height="12" patternUnits="userSpaceOnUse">
          <path d="M2 10 q 3 -8 6 0 M8 6 q 3 -6 5 0" stroke="var(--cobalt)" strokeWidth="1.3" fill="none" />
          <circle cx="11" cy="10" r="1.6" fill="var(--cobalt)" />
        </pattern>
      </defs>

      <rect width="1200" height="800" fill="var(--bg)" />

      {/* distant hills */}
      <path d="M0 250 C 160 200, 320 215, 470 235 S 760 268, 900 300 S 1110 330, 1200 334 L1200 420 L0 420 Z" fill="url(#ill-hatch)" />
      <path d="M0 250 C 160 200, 320 215, 470 235 S 760 268, 900 300 S 1110 330, 1200 334" fill="none" stroke="var(--cobalt)" strokeWidth="1" opacity="0.6" />

      <Trees />
      <Town />

      {/* sea */}
      <path
        d="M330 470 C 300 420, 420 392, 620 388 C 820 384, 1050 386, 1200 388 L1200 735 C 1000 700, 700 620, 520 560 C 400 520, 345 495, 330 470 Z"
        fill="var(--cobalt)"
      />
      <path
        d="M330 470 C 300 420, 420 392, 620 388 C 820 384, 1050 386, 1200 388 L1200 735 C 1000 700, 700 620, 520 560 C 400 520, 345 495, 330 470 Z"
        fill="url(#ill-waves)"
      />

      {/* promenade + beach */}
      <path d="M0 395 C 200 380, 300 400, 330 470 C 345 495, 400 520, 520 560 C 700 620, 1000 700, 1200 735 L1200 800 L0 800 Z" fill="url(#ill-stipple)" />
      <path d="M0 470 C 120 450, 200 470, 260 520 C 360 600, 700 720, 1000 800" fill="none" stroke="var(--cobalt)" strokeWidth="1" opacity="0.45" />
      <path d="M0 395 C 200 380, 300 400, 330 470 C 345 495, 400 520, 520 560 C 700 620, 1000 700, 1200 735" fill="none" stroke="var(--cobalt)" strokeWidth="1.2" />

      {/* a small car on the corniche */}
      <g transform="translate(560 668) rotate(8)">
        <rect x="0" y="-14" width="66" height="16" rx="5" fill="var(--bg)" stroke="var(--cobalt)" strokeWidth="1.4" />
        <path d="M14 -14 L22 -26 L46 -26 L54 -14 Z" fill="var(--bg)" stroke="var(--cobalt)" strokeWidth="1.4" />
        <path d="M24 -24 L30 -15 M44 -24 L40 -15" stroke="var(--cobalt)" strokeWidth="1" />
        <circle cx="14" cy="3" r="5" fill="var(--cobalt)" />
        <circle cx="52" cy="3" r="5" fill="var(--cobalt)" />
        <ellipse cx="33" cy="9" rx="36" ry="3" fill="var(--cobalt)" opacity="0.35" />
      </g>

      <Palm x={250} y={720} s={1.05} />

      {/* foreground shrubs */}
      <path
        d="M0 640 C 40 600, 90 620, 120 650 C 150 630, 200 640, 230 680 C 280 660, 340 690, 380 730 C 430 720, 480 750, 520 800 L0 800 Z"
        fill="url(#ill-leaves)"
      />
      <path
        d="M0 640 C 40 600, 90 620, 120 650 C 150 630, 200 640, 230 680 C 280 660, 340 690, 380 730 C 430 720, 480 750, 520 800"
        fill="none"
        stroke="var(--cobalt)"
        strokeWidth="1.4"
      />
    </svg>
  );
}
