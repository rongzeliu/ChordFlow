'use client';

import { useState, type ReactNode } from 'react';
import { Guitar, Loader2 } from 'lucide-react';
import { useAuthStore, useFirebaseAuthSync } from '@/lib/authStore';
import { isFirebaseConfigured } from '@/lib/firebase';
import { AuthFormContent, type AuthMode } from './AuthDialog';

export function AuthGate({ children }: { children: ReactNode }) {
  useFirebaseAuthSync();

  const { user, authLoading } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('signin');
  const configured = isFirebaseConfigured();

  // If Firebase is not configured (e.g. local offline environment without NEXT_PUBLIC_FIREBASE_*),
  // allow local-only workspace access so development and tests continue working.
  if (!configured) {
    return <>{children}</>;
  }

  if (authLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-base text-primary"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-honey/30 text-primary shadow-[0_2px_8px_rgba(26,56,43,0.08)]">
          <Guitar className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="inline-flex items-center gap-2 text-xs font-medium text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
          <span>Loading ChordFlow…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-y-auto bg-canvas text-primary">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-warm-border bg-base px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-honey/30 text-primary">
              <Guitar className="h-4 w-4 text-primary" aria-hidden="true" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-primary">ChordFlow</span>
          </div>
          <span className="text-xs font-medium text-muted">
            Smart chord sheets &amp; fretboard PDF studio
          </span>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md rounded-2xl border border-warm-border bg-surface shadow-[0_12px_36px_rgba(26,56,43,0.08)] transition-all duration-200 ease-out starting:scale-[0.98] starting:opacity-0">
            <div className="border-b border-warm-border bg-base px-6 py-5 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-honey/35 text-primary">
                  <Guitar className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-base font-semibold tracking-tight text-primary">
                    {mode === 'signin'
                      ? 'Welcome back to ChordFlow'
                      : 'Create your ChordFlow account'}
                  </h1>
                  <p className="mt-0.5 text-xs text-muted">
                    Sign in to access your chord workspace, starter templates, and cloud song
                    library.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <AuthFormContent idPrefix="gate-auth" mode={mode} onChangeMode={setMode} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
