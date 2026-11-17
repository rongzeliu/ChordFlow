'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Check, Cloud, Loader2, LogOut, User as UserIcon } from 'lucide-react';
import { useAuthStore, useFirebaseAuthSync } from '@/lib/authStore';
import { auth } from '@/lib/firebase';
import { AuthDialog } from './AuthDialog';

interface AuthAccountButtonProps {
  onStatusToast?: (message: string) => void;
}

export function AuthAccountButton({ onStatusToast }: AuthAccountButtonProps) {
  useFirebaseAuthSync();

  const { user, authLoading, syncStatus, authDialogOpen, setAuthDialogOpen } = useAuthStore();
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const openMenu = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setMenuClosing(false);
    setMenuMounted(true);
  }, []);

  const closeMenu = useCallback(() => {
    if (!menuMounted || menuClosing) return;
    setMenuClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setMenuMounted(false);
      setMenuClosing(false);
    }, 150);
  }, [menuMounted, menuClosing]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!menuMounted) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuMounted, closeMenu]);

  const handleSignOut = async () => {
    closeMenu();
    if (!auth) return;
    await signOut(auth);
    onStatusToast?.('Signed out');
  };

  const displayLabel =
    user?.displayName?.trim() || user?.email?.split('@')[0] || 'Account';
  const initial = displayLabel.charAt(0).toUpperCase();

  return (
    <>
      {authLoading ? (
        <span
          aria-label="Checking authentication status"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-warm-border bg-surface px-3 text-xs text-muted"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        </span>
      ) : user ? (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => (menuMounted && !menuClosing ? closeMenu() : openMenu())}
            aria-expanded={menuMounted && !menuClosing}
            aria-haspopup="menu"
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-primary/25 bg-surface px-2.5 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-honey/45 text-[11px] font-bold text-primary">
              {initial}
            </span>
            <span className="max-w-[110px] truncate">{displayLabel}</span>
            <span
              title={
                syncStatus === 'syncing'
                  ? 'Syncing songs to Cloud Firestore…'
                  : syncStatus === 'synced'
                    ? 'Saved songs synced to Cloud Firestore'
                    : 'Cloud sync'
              }
              className="flex items-center text-muted"
            >
              {syncStatus === 'syncing' ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <Cloud className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              )}
            </span>
          </button>

          {menuMounted && (
            <div
              role="menu"
              className={`absolute top-full right-0 z-40 mt-1.5 w-60 origin-top-right rounded-xl border border-warm-border bg-surface p-2 shadow-[0_12px_32px_rgba(26,56,43,0.16)] transition-all duration-150 ease-out starting:scale-95 starting:opacity-0 ${
                menuClosing ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'
              }`}
            >
              <div className="border-b border-warm-border px-2.5 py-2">
                <p className="truncate text-xs font-semibold text-primary">
                  {user.displayName || 'Signed in'}
                </p>
                {user.email && (
                  <p className="truncate text-[11px] text-muted">{user.email}</p>
                )}
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-sage px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <Check className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>
                    {syncStatus === 'syncing' ? 'Syncing library…' : 'Cloud sync active'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => void handleSignOut()}
                className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-primary transition hover:bg-sage/80"
              >
                <LogOut className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAuthDialogOpen(true)}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/25 bg-surface px-3.5 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
        >
          <UserIcon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
          <span>Sign in</span>
        </button>
      )}

      <AuthDialog
        open={authDialogOpen}
        onClose={() => setAuthDialogOpen(false)}
        onAuthSuccess={(msg) => onStatusToast?.(msg)}
      />
    </>
  );
}
