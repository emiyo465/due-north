// The Due North mark: a calendar page with a needle pointing north. Its colors
// are fixed (brand/due-north-logo.svg is the source), so it looks the same in
// both themes.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#4146cc" />
      <rect x="13" y="17" width="38" height="34" rx="6" fill="#fff" />
      <rect x="21" y="11" width="5" height="11" rx="2.5" fill="#fff" stroke="#4146cc" strokeWidth="2" />
      <rect x="38" y="11" width="5" height="11" rx="2.5" fill="#fff" stroke="#4146cc" strokeWidth="2" />
      <polygon points="32,25 40,45 32,40 24,45" fill="#4146cc" />
    </svg>
  )
}
