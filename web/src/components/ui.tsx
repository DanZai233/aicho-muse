import React, { ReactNode } from 'react';

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled, className = '' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  type?: 'button' | 'submit'; disabled?: boolean; className?: string;
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-ink text-paper hover:bg-ink/90 shadow-sm',
    ghost: 'text-ink/70 hover:bg-ink/5',
    subtle: 'bg-accentlight/60 text-ink hover:bg-accentlight',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100',
  };
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>{children}</button>;
}

export function Input({ label, value, onChange, placeholder, type = 'text', textarea = false, rows = 3, disabled = false }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; textarea?: boolean; rows?: number; disabled?: boolean;
}) {
  const cls = 'w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60';
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-ink/60">{label}</span>}
      {textarea
        ? <textarea rows={rows} value={value} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} className={`${cls} resize-y`} />
        : <input type={type} value={value} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} className={cls} />}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`${wide ? 'max-w-2xl' : 'max-w-md'} flex max-h-[90vh] w-full flex-col rounded-2xl bg-surface p-6 shadow-lift animate-fade-up`} onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h3 className="font-serif text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, color = 'default' }: { children: ReactNode; color?: 'default' | 'accent' | 'green' | 'amber' }) {
  const colors: Record<string, string> = {
    default: 'bg-ink/5 text-ink/60',
    accent: 'bg-accentlight/70 text-ink/80',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}>{children}</span>;
}

export function Avatar({ name, color, size = 'md' }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-7 w-7 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' };
  const initials = name.slice(0, 1);
  return (
    <div className={`${sizes[size]} flex items-center justify-center rounded-full font-serif font-semibold text-paper shrink-0`} style={{ background: color || '#8b7d6b' }}>
      {initials}
    </div>
  );
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-[3px]' }[size];
  return <div className={`${s} animate-spin rounded-full border-accent/30 border-t-accent`} />;
}

export function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-surface/50 px-6 py-14 text-center">
      <div className="mb-3 text-4xl">{icon}</div>
      <h3 className="font-serif text-lg font-semibold text-ink/80">{title}</h3>
      {desc && <p className="mt-1 max-w-sm text-sm text-ink/50">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
