import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  return <button type="button" className={`ui-button ui-button-${variant} ${className}`} {...props} />
}
export function SegmentedControl<T extends string>({
  value,
  items,
  onChange,
  label,
}: {
  value: T
  items: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      {items.map((item) => (
        <button type="button" key={item.value} aria-pressed={value === item.value} onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  )
}
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  )
}
export function LoadingState({ children = 'Загрузка…' }: { children?: ReactNode }) {
  return (
    <div className="loading-state" role="status">
      {children}
    </div>
  )
}
export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <div className="error-state" role="alert">
      {children}
    </div>
  )
}
