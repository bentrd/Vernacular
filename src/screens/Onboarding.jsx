import { useState } from 'react';
import * as db from '../store.js';
import { apiFetch } from '../sync.js';
import { toast } from '../ui/toast.js';
import { Group, StaticRow } from '../ui/Row.jsx';
import { SpinnerIcon } from '../icons.jsx';

// One screen to finish the profile after the first sign-in: name, preferred
// translation language, and the legal checkbox. Nothing else stands between
// the user and the app.
export function Onboarding({ user, onDone }) {
  const [name, setName] = useState(user?.name || '');
  const [native, setNative] = useState('fr');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasLocalWords = Object.values(db.getState().langs).some(
    (l) => Object.keys(l.dict || {}).length > 0
  );
  const ready = name.trim().length > 0 && agreed;

  async function finish() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: name.trim(),
          nativeLang: native,
          onboarded: true,
          acceptTos: true,
        }),
      });
      onDone(res.profile);
    } catch {
      toast('Could not save your profile, try again');
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen onboarding">
      <div className="auth-hero compact">
        <div className="eyebrow">Welcome</div>
        <h1 className="title">Make it yours.</h1>
        <p className="subtitle">
          {hasLocalWords
            ? 'Two quick things, then everything you’ve learned here moves into your account.'
            : 'Two quick things and you’re in.'}
        </p>
      </div>

      <div className="section-label">Your name</div>
      <Group>
        <div className="setting-row">
          <input
            className="auth-input bare"
            type="text"
            autoComplete="given-name"
            placeholder="What should we call you?"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </Group>

      <div className="section-label">Translations</div>
      <Group>
        <StaticRow title="Show meanings first in" subtitle="Both languages always appear">
          <div className="seg" role="radiogroup" aria-label="Translation language">
            {[
              ['fr', 'Français'],
              ['en', 'English'],
            ].map(([code, label]) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={native === code}
                className={`seg-btn${native === code ? ' on' : ''}`}
                onClick={() => setNative(code)}
              >
                {label}
              </button>
            ))}
          </div>
        </StaticRow>
      </Group>

      <div className="section-label">Legal</div>
      <Group>
        <button
          type="button"
          className="setting-row"
          onClick={() => setAgreed((a) => !a)}
          aria-pressed={agreed}
        >
          <span className="s-main">
            <span className="s-title">I agree to the terms</span>
            <span className="s-sub">
              The <a href="#/terms" onClick={(e) => e.stopPropagation()}>Terms of Service</a> and{' '}
              <a href="#/privacy" onClick={(e) => e.stopPropagation()}>Privacy Policy</a>, in
              short: your words stay yours.
            </span>
          </span>
          <span className={`checkbox${agreed ? ' on' : ''}`} aria-hidden="true">
            {agreed ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4.5 4.5L19 7" />
              </svg>
            ) : null}
          </span>
        </button>
      </Group>

      <div className="onboarding-cta">
        <button type="button" className="btn accent full" disabled={!ready || busy} onClick={finish}>
          {busy ? <SpinnerIcon /> : null}
          Start learning
        </button>
      </div>
    </div>
  );
}
