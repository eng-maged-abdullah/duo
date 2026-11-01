export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9b5ff" />
          <stop offset="1" stopColor="#7040e0" />
        </linearGradient>
        <linearGradient id="lg-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb3d2" />
          <stop offset="1" stopColor="#f0509a" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="32" r="16" fill="url(#lg-a)" opacity="0.95" />
      <circle cx="40" cy="32" r="16" fill="url(#lg-b)" opacity="0.85" style={{ mixBlendMode: 'screen' }} />
      <path d="M32 18.14a16 16 0 0 1 0 27.72a16 16 0 0 1 0-27.72z" fill="#fff" opacity="0.9" />
    </svg>
  )
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'lg' ? 64 : size === 'md' ? 40 : 30
  const text = size === 'lg' ? 'text-5xl' : size === 'md' ? 'text-3xl' : 'text-2xl'
  return (
    <div className="flex items-center gap-2.5" dir="ltr">
      <LogoMark size={px} />
      <span className={`font-display font-semibold tracking-[0.18em] ${text} text-gradient`}>DUO</span>
    </div>
  )
}
