import type { CSSProperties } from "react";
import type { Accent } from "../shared/protocol";

export const accentVar = (a: Accent | string) => ({ "--accent": `var(--${a})` }) as CSSProperties;

// ---- cute cards ----

const CARD_TINTS = ["mauve", "pink", "peach", "yellow", "green", "teal", "sky", "lavender", "rosewater"] as const;
const FACES = ["smile", "wink", "ooh", "sleepy", "grin", "blep"] as const;

/** Stable look for card number `n`, so the same card keeps its face while it flies. */
export const cardLook = (n: number) => ({
  tint: CARD_TINTS[(n * 7 + 3) % CARD_TINTS.length],
  face: FACES[(n * 5 + 1) % FACES.length],
});

function Face({ face }: { face: (typeof FACES)[number] }) {
  const eye = "var(--crust)";
  const eyes =
    face === "wink" ? (
      <>
        <circle cx="22" cy="40" r="3.6" fill={eye} />
        <path d="M34 40q4 -4 8 0" fill="none" stroke={eye} strokeWidth="2.6" strokeLinecap="round" />
      </>
    ) : face === "sleepy" ? (
      <>
        <path d="M18 40q4 3 8 0" fill="none" stroke={eye} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M34 40q4 3 8 0" fill="none" stroke={eye} strokeWidth="2.6" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="22" cy="40" r="3.6" fill={eye} />
        <circle cx="38" cy="40" r="3.6" fill={eye} />
        <circle cx="23.2" cy="38.8" r="1.1" fill="var(--text)" />
        <circle cx="39.2" cy="38.8" r="1.1" fill="var(--text)" />
      </>
    );
  const mouth =
    face === "ooh" ? (
      <ellipse cx="30" cy="51" rx="3" ry="3.6" fill={eye} />
    ) : face === "grin" ? (
      <path d="M23 48q7 9 14 0z" fill={eye} />
    ) : face === "blep" ? (
      <>
        <path d="M24 48q3 3 6 0q3 3 6 0" fill="none" stroke={eye} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M29 49.5q2.5 5.5 5 0" fill="var(--red)" />
      </>
    ) : (
      <path d="M25 48q5 5 10 0" fill="none" stroke={eye} strokeWidth="2.6" strokeLinecap="round" />
    );
  return (
    <>
      {eyes}
      <ellipse cx="15" cy="48" rx="4.6" ry="2.8" fill="var(--red)" opacity=".45" />
      <ellipse cx="45" cy="48" rx="4.6" ry="2.8" fill="var(--red)" opacity=".45" />
      {mouth}
    </>
  );
}

export function CuteCard({ n, className = "", style }: { n: number; className?: string; style?: CSSProperties }) {
  const { tint, face } = cardLook(n);
  return (
    <svg className={`sb-card ${className}`} viewBox="0 0 60 84" style={{ ...accentVar(tint), ...style }} aria-hidden="true">
      <rect x="1.5" y="1.5" width="57" height="81" rx="9" fill="var(--accent)" />
      <rect x="1.5" y="1.5" width="57" height="81" rx="9" fill="none" stroke="var(--crust)" strokeOpacity=".25" />
      <rect
        x="6"
        y="6"
        width="48"
        height="72"
        rx="6"
        fill="none"
        stroke="var(--crust)"
        strokeOpacity=".22"
        strokeWidth="1.6"
        strokeDasharray="3 3.5"
      />
      <path d="M14 15l1.6 3.4 3.4 1.6-3.4 1.6L14 25l-1.6-3.4L9 20l3.4-1.6z" fill="var(--base)" opacity=".55" />
      <path d="M46 62.5c0-2 2.6-3 3.8-1.2 1.2-1.8 3.8-.8 3.8 1.2 0 2.4-3.8 4.8-3.8 4.8s-3.8-2.4-3.8-4.8z" fill="var(--base)" opacity=".5" />
      <Face face={face} />
    </svg>
  );
}

/** Face-down card for the deck: a woven back with a sleepy moon. */
export function CardBack({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={`sb-card ${className}`} viewBox="0 0 60 84" style={style} aria-hidden="true">
      <defs>
        <pattern id="sb-weave" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="var(--surface-0)" />
          <rect width="4" height="8" fill="var(--surface-1)" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width="57" height="81" rx="9" fill="var(--mantle)" stroke="var(--surface-2)" strokeOpacity=".6" />
      <rect x="6" y="6" width="48" height="72" rx="6" fill="url(#sb-weave)" />
      <circle cx="30" cy="42" r="13" fill="var(--mauve)" />
      <circle cx="35" cy="38" r="11" fill="var(--surface-0)" />
      <path d="M22 44q2.5 2 5 0" fill="none" stroke="var(--crust)" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="21" cy="48" rx="2.4" ry="1.4" fill="var(--pink)" opacity=".7" />
    </svg>
  );
}

// ---- dice ----

export function D8({ value }: { value: number | string }) {
  // A d8 seen tip-on: one triangular face up front, three faces around it.
  const pts = (a: number[]) => a.join(" ");
  const hex = [50, 4, 92, 28, 92, 76, 50, 98, 8, 76, 8, 28];
  return (
    <svg className="sb-die" viewBox="0 0 100 102" aria-hidden="true">
      <polygon points={pts(hex)} fill="color-mix(in srgb, var(--accent) 55%, var(--crust))" />
      <polygon points={pts([50, 4, 92, 28, 92, 76])} fill="color-mix(in srgb, var(--accent) 72%, var(--crust))" />
      <polygon points={pts([8, 76, 50, 98, 92, 76])} fill="color-mix(in srgb, var(--accent) 45%, var(--crust))" />
      <polygon points={pts([50, 4, 92, 76, 8, 76])} fill="var(--accent)" />
      <polygon
        points={pts([50, 4, 92, 76, 8, 76])}
        fill="none"
        stroke="var(--text)"
        strokeOpacity=".25"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <text x="50" y="62" textAnchor="middle" dominantBaseline="middle" className="sb-die-num">
        {value}
      </text>
    </svg>
  );
}

export function D10({ value }: { value: number | string }) {
  // A d10 (pentagonal trapezohedron) seen face-on: a kite in front, faces fanning out to the sides.
  const pts = (a: number[]) => a.join(" ");
  return (
    <svg className="sb-die" viewBox="0 0 100 102" aria-hidden="true">
      <polygon points={pts([50, 3, 96, 42, 90, 68, 50, 99, 10, 68, 4, 42])} fill="color-mix(in srgb, var(--accent) 50%, var(--crust))" />
      <polygon points={pts([50, 3, 96, 42, 78, 56])} fill="color-mix(in srgb, var(--accent) 74%, var(--crust))" />
      <polygon points={pts([50, 3, 4, 42, 22, 56])} fill="color-mix(in srgb, var(--accent) 64%, var(--crust))" />
      <polygon points={pts([22, 56, 50, 74, 50, 99, 10, 68])} fill="color-mix(in srgb, var(--accent) 42%, var(--crust))" />
      <polygon points={pts([78, 56, 50, 74, 50, 99, 90, 68])} fill="color-mix(in srgb, var(--accent) 36%, var(--crust))" />
      <polygon points={pts([50, 3, 78, 56, 50, 74, 22, 56])} fill="var(--accent)" />
      <polygon
        points={pts([50, 3, 78, 56, 50, 74, 22, 56])}
        fill="none"
        stroke="var(--text)"
        strokeOpacity=".25"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" className="sb-die-num is-d10">
        {value}
      </text>
    </svg>
  );
}

export function D4({ value }: { value: number | string }) {
  // A d4 standing on its base: one big face up front, a sliver of the base below.
  const pts = (a: number[]) => a.join(" ");
  return (
    <svg className="sb-die" viewBox="0 0 100 102" aria-hidden="true">
      <polygon points={pts([6, 84, 94, 84, 50, 99])} fill="color-mix(in srgb, var(--accent) 45%, var(--crust))" strokeLinejoin="round" />
      <polygon points={pts([50, 5, 94, 84, 6, 84])} fill="var(--accent)" />
      <polygon
        points={pts([50, 5, 94, 84, 6, 84])}
        fill="none"
        stroke="var(--text)"
        strokeOpacity=".25"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <text x="50" y="62" textAnchor="middle" dominantBaseline="middle" className="sb-die-num">
        {value}
      </text>
    </svg>
  );
}

export function D6({ value }: { value: number | string }) {
  // A cube seen from above and to the left.
  const pts = (a: number[]) => a.join(" ");
  return (
    <svg className="sb-die" viewBox="0 0 100 102" aria-hidden="true">
      <polygon
        points={pts([12, 28, 30, 10, 94, 10, 76, 28])}
        fill="color-mix(in srgb, var(--accent) 72%, var(--text))"
        strokeLinejoin="round"
      />
      <polygon
        points={pts([76, 28, 94, 10, 94, 76, 76, 94])}
        fill="color-mix(in srgb, var(--accent) 50%, var(--crust))"
        strokeLinejoin="round"
      />
      <rect x="12" y="28" width="64" height="66" rx="6" fill="var(--accent)" />
      <rect x="12" y="28" width="64" height="66" rx="6" fill="none" stroke="var(--text)" strokeOpacity=".25" strokeWidth="1.5" />
      <text x="44" y="62" textAnchor="middle" dominantBaseline="middle" className="sb-die-num">
        {value}
      </text>
    </svg>
  );
}

/** The die for any supported side count. */
export function Die({ sides, value }: { sides: number; value: number | string }) {
  const Face = sides === 4 ? D4 : sides === 6 ? D6 : sides === 8 ? D8 : D10;
  return <Face value={value} />;
}

// ---- small icons ----

export function Mug({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 44" aria-hidden="true">
      <path d="M29 16h4a6 6 0 0 1 0 12h-4" fill="none" stroke="var(--peach)" strokeWidth="3.4" />
      <rect x="5" y="12" width="25" height="29" rx="5" fill="var(--yellow)" />
      <rect x="9" y="18" width="3" height="17" rx="1.5" fill="var(--text)" opacity=".45" />
      <path d="M4 14c-2-6 4-10 8-7 2-5 10-5 12 0 4-3 10 1 7 7z" fill="var(--text)" />
      <circle cx="12" cy="11" r="3" fill="var(--text)" />
    </svg>
  );
}

export function Ghost({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 44" aria-hidden="true">
      <path d="M6 20a14 14 0 0 1 28 0v20l-4.6-3.4L25 40l-5-3.4-5 3.4-4.4-3.4L6 40z" fill="var(--text)" />
      <circle cx="15" cy="20" r="2.6" fill="var(--crust)" />
      <circle cx="25" cy="20" r="2.6" fill="var(--crust)" />
      <ellipse cx="20" cy="28" rx="3" ry="3.6" fill="var(--crust)" />
    </svg>
  );
}

export function Crown({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 30" aria-hidden="true">
      <path d="M4 26l-2-18 10 8 8-14 8 14 10-8-2 18z" fill="var(--yellow)" />
      <circle cx="20" cy="18" r="2.6" fill="var(--red)" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export function ArrowIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir === "left" ? <path d="M19 12H5m6-6-6 6 6 6" /> : <path d="M5 12h14m-6-6 6 6-6 6" />}
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg
      className="cn-icon-sm"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
