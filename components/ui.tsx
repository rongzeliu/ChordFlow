'use client';

import { useId, type ReactNode } from 'react';

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
    </div >
  );
}

/**
 * Segmented control built on native radio inputs so it is keyboard- and screen-reader-accessible
 * (arrow keys move between options, one tab stop for the group).
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
  const name = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-xs font-medium text-muted">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col rounded-lg border border-warm-border bg-sage p-1">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="cursor-pointer rounded-md px-2 py-1.5 text-center text-xs font-medium text-muted transition-colors hover:text-primary has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:text-primary has-[:checked]:shadow-[0_1px_2px_rgba(26,56,43,0.08)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-honey"
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export const inputClass =
  'w-full rounded-lg border border-warm-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-honey/45 focus:outline-none';
