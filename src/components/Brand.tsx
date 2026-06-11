export function LogoMark({ size = 32 }: { size?: number }) {
  const inner = Math.round(size * 0.53);
  return (
    <span
      className="grid place-items-center rounded-[0.55rem] bg-accent shadow-[0_6px_16px_-6px] shadow-accent/70"
      style={{ width: size, height: size }}
    >
      {/* "Progressive overload" mark: three ascending bars, centered. Uses
          currentColor (text-on-accent) so the glyph flips with the theme —
          warm-black on the orange tile in dark, orange on the white tile in
          the light-mode sidebar. */}
      <svg viewBox="0 0 24 24" width={inner} height={inner} aria-hidden className="text-on-accent">
        <rect x="3.5" y="13" width="4" height="7" rx="1.3" fill="currentColor" />
        <rect x="10" y="9.5" width="4" height="10.5" rx="1.3" fill="currentColor" />
        <rect x="16.5" y="6" width="4" height="14" rx="1.3" fill="currentColor" />
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
