'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';

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

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  triggerLabel?: string;
}

/** Accessible custom select dropdown styled to match ChordFlow's sage/forest/honey palette. */
export function CustomSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  menuWidthClass = 'w-64',
}: {
  id?: string;
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  menuWidthClass?: string;
}) {
  const generatedId = useId();
  const buttonId = id ?? generatedId;
  const labelId = `${buttonId}-label`;
  const listboxId = `${buttonId}-listbox`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );

  const openMenu = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const idx = options.findIndex((o) => o.value === value);
    setHighlightedIndex(idx >= 0 ? idx : 0);
    setClosing(false);
    setMounted(true);
  }, [options, value]);

  const closeMenu = useCallback(() => {
    if (!mounted || closing) return;
    setClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setMounted(false);
      setClosing(false);
    }, 150);
  }, [mounted, closing]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [mounted, closeMenu]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  const handleSelect = (opt: SelectOption<T>) => {
    onChange(opt.value);
    closeMenu();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (mounted) {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        triggerRef.current?.focus();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!mounted) {
        openMenu();
        return;
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setHighlightedIndex((prev) => (prev + delta + options.length) % options.length);
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && mounted && !closing) {
      e.preventDefault();
      const opt = options[highlightedIndex];
      if (opt) handleSelect(opt);
    }
  };

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown} className="relative space-y-2">
      <label id={labelId} htmlFor={buttonId} className="block text-xs font-medium text-muted">
        {label}
      </label>
      <button
        ref={triggerRef}
        id={buttonId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={mounted && !closing}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        onClick={() => (mounted && !closing ? closeMenu() : openMenu())}
        className="flex h-[34px] w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-warm-border bg-surface px-3 text-left text-xs font-medium text-primary transition hover:border-primary/40 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-honey/45 focus-visible:outline-none"
      >
        <span className="truncate">{selected?.triggerLabel ?? selected?.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150 ${
            mounted && !closing ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {mounted && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          className={`absolute top-full left-0 z-30 mt-1.5 min-w-full ${menuWidthClass} origin-top rounded-xl border border-warm-border bg-surface p-1.5 shadow-[0_12px_32px_rgba(26,56,43,0.16)] transition-all duration-150 ease-out starting:scale-95 starting:opacity-0 ${
            closing ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'
          }`}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onClick={() => handleSelect(opt)}
                className={`flex w-full cursor-pointer items-start justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  isSelected
                    ? 'bg-honey-tint text-primary'
                    : isHighlighted
                      ? 'bg-sage/80 text-primary'
                      : 'text-primary hover:bg-sage/70'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-primary">{opt.label}</span>
                  {opt.description && (
                    <span className="block text-[11px] text-muted">{opt.description}</span>
                  )}
                </span>
                {isSelected && (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border border-warm-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-honey/45 focus:outline-none';
