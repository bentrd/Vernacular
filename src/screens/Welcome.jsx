import { useEffect, useState } from 'react';
import { GAUTH_ERROR_KEY, sendMagicLink, signInWithGoogle } from '../auth.js';
import { toast } from '../ui/toast.js';
import { GoogleIcon, MailIcon, SpinnerIcon } from '../icons.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The signed-out gate: magic link or Google, nothing else. No passwords.
export function Welcome() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(null); // 'link' | 'google' | null
  const [sentTo, setSentTo] = useState(null);

  // A failed Google round trip lands back here with a flag set at boot.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(GAUTH_ERROR_KEY)) {
        sessionStorage.removeItem(GAUTH_ERROR_KEY);
        toast('Google sign-in didn’t complete, try again');
      }
    } catch {
      /* private mode */
    }
  }, []);

  async function submitEmail(e) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) {
      toast('That email address doesn’t look right');
      return;
    }
    setBusy('link');
    try {
      await sendMagicLink(addr);
      setSentTo(addr);
    } catch {
      toast('Could not send the link, try again');
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setBusy('google');
    try {
      await signInWithGoogle(); // navigates away on success
    } catch {
      toast('Google sign-in didn’t start, try again');
      setBusy(null);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-hero">
        <div className="auth-brand">Verbum</div>
        <p className="auth-tagline">Learn a language, one word at a time.</p>
      </div>

      {sentTo ? (
        <div className="card auth-card">
          <div className="auth-sent-icon">
            <MailIcon />
          </div>
          <h2 className="auth-card-title">Check your inbox</h2>
          <p className="auth-card-sub">
            We sent a sign-in link to <strong>{sentTo}</strong>. Open it on this device to
            continue. The link works for 15 minutes.
          </p>
          <button type="button" className="btn ghost full" onClick={() => setSentTo(null)}>
            Use a different email
          </button>
        </div>
      ) : (
        <div className="card auth-card">
          <form onSubmit={submitEmail}>
            <label className="auth-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!busy}
            />
            <button type="submit" className="btn accent full" disabled={!!busy}>
              {busy === 'link' ? <SpinnerIcon /> : <MailIcon />}
              Email me a sign-in link
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button type="button" className="btn quiet full" onClick={google} disabled={!!busy}>
            {busy === 'google' ? <SpinnerIcon /> : <GoogleIcon />}
            Continue with Google
          </button>

          <p className="auth-note">
            No passwords. If it's your first time, your account is created on the spot, and
            anything you've learned on this device comes with you.
          </p>
        </div>
      )}

      <p className="auth-legal">
        By continuing, you agree to the <a href="#/terms">Terms of Service</a> and the{' '}
        <a href="#/privacy">Privacy Policy</a>.
      </p>
    </div>
  );
}
