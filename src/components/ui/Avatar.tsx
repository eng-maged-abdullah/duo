export function Avatar({
  name,
  seat,
  online,
  speaking,
  size = 40,
}: {
  name: string
  seat: 1 | 2
  online?: boolean
  speaking?: boolean
  size?: number
}) {
  const bg = seat === 1 ? 'from-[#b4d2e7] to-[#5e9aa3]' : 'from-[#f8f8f8] to-[#a1a6b4]'
  return (
    <div className={`relative shrink-0 ${speaking ? 'speaking-ring' : ''}`} style={{ width: size, height: size }}>
      <div
        className={`grid size-full place-items-center rounded-full bg-gradient-to-br ${bg} font-display font-semibold text-[#000100] shadow-lg ring-1 ring-black/10`}
        style={{ fontSize: size * 0.42 }}
      >
        {[...name.trim()][0] ?? '؟'}
      </div>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 end-0 size-3 rounded-full border-2 border-night-900 ${online ? 'bg-emerald-400' : 'bg-zinc-500'}`}
          aria-label={online ? 'متصل' : 'غير متصل'}
        />
      )}
    </div>
  )
}
