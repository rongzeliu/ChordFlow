'use client';

import { useId, type KeyboardEvent, type ReactNode } from 'react';

/** Small section heading used to separate sidebar groups without boxing them in cards. */
export function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 px-7 py-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[13px] font-semibold tracking-tight text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Labelled form field wrapper with consistent label → control spacing. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Accessible segmented control built with buttons (`role="radiogroup"` / `role="radio"`).
 * Avoids off-screen `sr-only` absolute inputs that can cause the browser to scroll the root
 * document when clicked inside a scrolled sidebar container.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const labelId = useId();

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const currentIndex = options.findIndex((o) => o.value === value);
    if (currentIndex === -1) return;
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + delta + options.length) % options.length;
    onChange(options[nextIndex].value);
  };

  return (
    <div className="space-y-2">
      <span id={labelId} className="block text-xs font-medium text-muted">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={handleKeyDown}
        className="grid auto-cols-fr grid-flow-col rounded-lg border border-warm-border bg-sage p-1"
      >
        {options.map((opt) => {
          const checked = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(opt.value)}
              className={`cursor-pointer rounded-md px-2 py-1.5 text-center text-xs transition-colors focus-visible:ring-2 focus-visible:ring-honey focus-visible:outline-none ${
                checked
                  ? 'bg-surface font-semibold text-primary shadow-[0_1px_2px_rgba(26,56,43,0.08)]'
                  : 'font-medium text-muted hover:text-primary'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border border-warm-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-honey/45 focus:outline-none';
