'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { Cloud, Loader2, Lock, Mail, X } from 'lucide-react';
import { formatFirebaseAuthError } from '@/lib/authStore';
import { auth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';
import { Field, inputClass, Segmented } from './ui';

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  onAuthSuccess?: (message: string) => void;
}

type AuthMode = 'signin' | 'signup';

export function AuthDialog({ open, onClose, onAuthSuccess }: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const wasOpenRef = useRef(false);
  const titleId = useId();

  const [isClosing, setIsClosing] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState<string | null>(null);

  const configured = isFirebaseConfigured();

  const closeWithFade = useCallback(() => {
    setIsClosing(true);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      dialogRef.current?.close();
    }, 180);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        if (closeTimerRef.current) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        setIsClosing(false);
        setError(null);
        setResetSent(null);
        if (!dialog.open) {
          dialog.showModal();
        }
      }
    } else {
      wasOpenRef.current = false;
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      wasOpenRef.current = false;
      setIsClosing(false);
      onClose();
    };

    const handleCancel = (e: Event) => {
      e.preventDefault();
      closeWithFade();
    };

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
      );
    };
    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        closeWithFade();
      }
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, [onClose, closeWithFade]);

  const handleGoogleSignIn = async () => {
    if (!auth || !googleProvider) {
      setError('Firebase Authentication is not configured in environment variables.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      setResetSent(null);
      await signInWithPopup(auth, googleProvider);
      onAuthSuccess?.('Signed in with Google');
      closeWithFade();
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Firebase Authentication is not configured in environment variables.');
      return;
    }
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Please enter both your email and password.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      setResetSent(null);
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        onAuthSuccess?.('Signed in');
      } else {
        await createUserWithEmailAndPassword(auth, cleanEmail, password);
        onAuthSuccess?.('Account created & signed in');
      }
      setPassword('');
      closeWithFade();
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth) {
      setError('Firebase Authentication is not configured in environment variables.');
      return;
    }
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Enter your email address above first, then click "Forgot password?".');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await sendPasswordResetEmail(auth, cleanEmail);
      setResetSent(`Password reset link sent to ${cleanEmail}.`);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={`m-auto w-full max-w-md rounded-2xl border border-warm-border bg-surface p-0 text-primary shadow-[0_20px_50px_rgba(26,56,43,0.22)] transition-all duration-200 ease-out starting:scale-[0.98] starting:opacity-0 backdrop:bg-primary/45 backdrop:backdrop-blur-[1px] backdrop:transition-opacity backdrop:duration-200 starting:backdrop:opacity-0 ${
        isClosing
          ? 'pointer-events-none scale-[0.98] opacity-0 backdrop:opacity-0'
          : 'scale-100 opacity-100'
      }`}
    >
      {open && (
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-warm-border bg-base px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-honey/30 text-primary">
                <Cloud className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 id={titleId} className="text-base font-semibold tracking-tight text-primary">
                  {mode === 'signin' ? 'Sign in to ChordFlow' : 'Create your ChordFlow account'}
                </h2>
                <p className="text-xs text-muted">
                  Sync your saved songs, custom voicings, and grid layouts across devices.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeWithFade}
              aria-label="Close sign in dialog"
              className="rounded-lg p-1.5 text-muted transition hover:bg-sage hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-5 p-6">
            {!configured && (
              <div
                role="alert"
                className="rounded-xl border border-honey-deep/50 bg-honey-tint p-3.5 text-xs text-primary"
              >
                <p className="font-semibold">Firebase is not configured yet</p>
                <p className="mt-1 leading-relaxed text-muted">
                  Add your <code className="font-mono text-primary">NEXT_PUBLIC_FIREBASE_*</code>{' '}
                  keys to <code className="font-mono text-primary">.env.local</code> (see{' '}
                  <code className="font-mono text-primary">.env.example</code>) to enable Google
                  Sign-In and Cloud Firestore sync. Your songs continue to save locally in your
                  browser.
                </p>
              </div>
            )}

            {/* Google Sign-In Button */}
            <button
              type="button"
              disabled={!configured || submitting}
              onClick={() => void handleGoogleSignIn()}
              className="flex h-10 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-warm-border-strong bg-surface px-4 text-xs font-semibold text-primary shadow-[0_1px_2px_rgba(26,56,43,0.06)] transition hover:bg-sage/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.45 1.16-4.22 1.16-3.24 0-5.99-2.19-6.97-5.14H1.02v3.14C3.03 21.14 7.21 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.03 14.01c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.29H1.02A11.99 11.99 0 0 0 0 11.72c0 1.92.46 3.74 1.02 5.43l4.01-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.5-3.5C18.07 1.19 15.3 0 12 0 7.21 0 3.03 2.86 1.02 6.85l4.01 3.14c.98-2.95 3.73-5.24 6.97-5.24Z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-warm-border" />
              <span className="bg-surface px-3 text-[11px] font-medium text-muted uppercase">
                or email
              </span>
              <div className="w-full border-t border-warm-border" />
            </div>

            <Segmented<AuthMode>
              label="Account mode"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
                setResetSent(null);
              }}
              options={[
                { value: 'signin', label: 'Sign in' },
                { value: 'signup', label: 'Create account' },
              ]}
            />

            <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-4">
              <Field label="Email address" htmlFor="auth-email">
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={`${inputClass} pl-9 text-xs`}
                  />
                </div>
              </Field>

              <Field label="Password" htmlFor="auth-password">
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className={`${inputClass} pl-9 text-xs`}
                  />
                </div>
              </Field>

              {mode === 'signin' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!configured || submitting}
                    onClick={() => void handlePasswordReset()}
                    className="cursor-pointer text-xs font-medium text-muted underline decoration-honey decoration-2 underline-offset-2 hover:text-primary disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
                >
                  {error}
                </p>
              )}

              {resetSent && (
                <p
                  role="status"
                  className="rounded-lg border border-primary/20 bg-sage px-3 py-2 text-xs font-medium text-primary"
                >
                  {resetSent}
                </p>
              )}

              <button
                type="submit"
                disabled={!configured || submitting}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-base shadow-[0_1px_2px_rgba(26,56,43,0.16)] transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>{mode === 'signin' ? 'Sign in with Email' : 'Create Account'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </dialog>
  );
}
