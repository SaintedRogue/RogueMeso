export function LogoMark({ size = 32 }: { size?: number }) {
  const inner = Math.round(size * 0.53);
  return (
    <span
      className="grid place-items-center rounded-[0.55rem] bg-accent shadow-[0_6px_16px_-6px] shadow-accent/70"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={inner} height={inner} aria-hidden>
        <rect x="3" y="14" width="4" height="7" rx="1" fill="#1a0d04" />
        <rect x="10" y="9" width="4" height="12" rx="1" fill="#1a0d04" />
        <rect x="17" y="4" width="4" height="17" rx="1" fill="#1a0d04" />
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
