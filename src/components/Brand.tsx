export function LogoMark({ size = 32 }: { size?: number }) {
  const inner = Math.round(size * 0.53);
  return (
    <span
      className="grid place-items-center rounded-[0.55rem] bg-accent shadow-[0_6px_16px_-6px] shadow-accent/70"
      style={{ width: size, height: size }}
    >
      {/* Refined "progressive overload" mark: three ascending bars with a rising
          arrow tick. Uses currentColor (text-on-accent) so the glyph flips with
          the theme — warm-black on the orange tile in dark, white in light. */}
      <svg viewBox="0 0 24 24" width={inner} height={inner} aria-hidden className="text-on-accent">
        <rect x="2.5" y="13" width="4" height="8.5" rx="1.3" fill="currentColor" />
        <rect x="9" y="10" width="4" height="11.5" rx="1.3" fill="currentColor" />
        <rect x="15.5" y="8" width="4" height="13.5" rx="1.3" fill="currentColor" />
        <path d="M13.2 9.5 L20 6.2" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        <path d="M14.5 6.2 H20 V11.7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Wordmark({ size = "text-lg" }: { size?: string }) {
  return (
    <span className={`font-bold tracking-tight ${size}`} style={{ fontFamily: "var(--font-display)" }}>
      Rogue<span className="text-accent">Meso</span>
    </span>
  );
}
