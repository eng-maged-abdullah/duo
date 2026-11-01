import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { sfx } from '../../lib/sound'

type Variant = 'primary' | 'glass' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  block?: boolean
  silent?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'btn-primary text-white',
  glass: 'glass text-cloud hover:bg-white/10',
  ghost: 'text-mist hover:text-cloud hover:bg-white/5',
  danger: 'bg-rose-500/15 text-rose-300 border border-rose-400/30 hover:bg-rose-500/25',
  soft: 'bg-iris-500/15 text-iris-300 border border-iris-400/25 hover:bg-iris-500/25',
}
const sizes: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm rounded-xl gap-1.5',
  md: 'h-12 px-5 text-[15px] rounded-2xl gap-2',
  lg: 'h-14 px-6 text-base rounded-2xl gap-2.5',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'glass', size = 'md', loading, icon, block, silent, className = '', children, disabled, onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      onClick={(e) => {
        if (!silent) sfx('tap')
        onClick?.(e)
      }}
      className={`relative inline-flex items-center justify-center font-medium transition-all duration-200 ease-[var(--ease-soft)] active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-400 ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      {children && <span className="truncate">{children}</span>}
    </button>
  )
})

export function IconButton({
  label,
  children,
  active,
  className = '',
  badge,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; badge?: number }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`relative inline-flex size-11 shrink-0 items-center justify-center rounded-2xl transition-all active:scale-95 disabled:opacity-40 ${
        active ? 'bg-white/15 text-white' : 'glass text-cloud hover:bg-white/10'
      } ${className}`}
      {...rest}
    >
      {children}
      {badge ? (
        <span className="absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-[11px] font-bold leading-5 text-white text-center shadow-lg">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </button>
  )
}
