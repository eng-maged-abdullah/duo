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
  const bg = seat === 1 ? 'from-iris-300 to-iris-600' : 'from-rose-300 to-rose-500'
  return (
    <div className={`relative shrink-0 ${speaking ? 'speaking-ring' : ''}`} style={{ width: size, height: size }}>
      <div
        className={`grid size-full place-items-center rounded-full bg-gradient-to-br ${bg} font-display font-semibold text-night-950 shadow-lg`}
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
