import React, { useState, useSyncExternalStore } from 'react';
import { Sheet } from './ui/Sheet';
import { useGameStore } from '../store/gameStore';
import { clearSignInResult, deleteAccount, sendSignInLink, setMarketing, signInAvailable, signInWith, signOut, useAccount } from '../services/account';
import { cookieChoice, reopenCookieBanner, subscribeConsent } from '../services/consent';

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', facebook: 'Facebook', email: 'email link' };

/** The sign-in sheet: Google, Facebook, or an emailed link; game news only if ticked. */
export const SignInSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { options } = useAccount();
  const [email, setEmail] = useState('');
  const [marketing, setMarketingBox] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Leaving the page for Google or Facebook: the game in progress is saved first
  const goTo = async (provider: 'google' | 'facebook') => {
    setBusy(true);
    await useGameStore.getState().autosave().catch(() => undefined);
    signInWith(provider, marketing);
  };
  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    await useGameStore.getState().autosave().catch(() => undefined);
    const problem = await sendSignInLink(email.trim(), marketing);
    setBusy(false);
    if (problem) setError(problem);
    else setSentTo(email.trim());
  };

  if (sentTo)
    return (
      <Sheet title="Sign in" onClose={onClose}>
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{ fontSize: '40px' }} aria-hidden="true">
            📬
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold' }}>Check your email</div>
          <p style={{ color: '#475569', margin: '6px 0 0' }}>
            We sent a sign-in link to <b>{sentTo}</b>. It works for 15 minutes, on this or any device.
          </p>
          <button className="ui-btn ui-btn-block" style={{ marginTop: '14px' }} onClick={() => setSentTo(null)}>
            Use a different email
          </button>
        </div>
      </Sheet>
    );

  return (
    <Sheet title="Sign in" onClose={onClose}>
      <p style={{ color: '#475569', margin: '0 0 4px', fontSize: '14px' }}>Keep your saves on every device and your Hall of Fame careers under your name.</p>
      {!signInAvailable(options) && <p style={{ color: '#B91C1C', fontSize: '14px' }}>Sign-in isn't available right now. Try again later.</p>}
      {options.google && (
        <button className="account-provider" onClick={() => goTo('google')} disabled={busy}>
          <span aria-hidden="true" style={{ color: '#4285F4', fontWeight: 900, fontSize: '18px' }}>
            G
          </span>{' '}
          Continue with Google
        </button>
      )}
      {options.facebook && (
        <button className="account-provider" onClick={() => goTo('facebook')} disabled={busy} style={{ background: '#1877F2', borderColor: '#1877F2', color: '#fff' }}>
          <span aria-hidden="true" style={{ fontWeight: 900, fontSize: '18px' }}>
            f
          </span>{' '}
          Continue with Facebook
        </button>
      )}
      {options.email && (
        <form onSubmit={sendLink}>
          {(options.google || options.facebook) && <div className="account-or">or</div>}
          <label style={{ display: 'block', fontSize: '14px', color: '#334155', marginTop: '6px' }}>
            Email
            <input
              type="email"
              className="ui-input"
              autoComplete="email"
              placeholder="coach@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px' }}
            />
          </label>
          <button type="submit" className="ui-btn ui-btn-block" disabled={busy} style={{ marginTop: '10px', background: '#2563EB', borderColor: '#2563EB', color: '#fff' }}>
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" style={{ color: '#B91C1C', fontSize: '14px', margin: '8px 0 0' }}>
          {error}
        </p>
      )}
      <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '14px', fontSize: '14px', color: '#334155' }}>
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketingBox(e.target.checked)} style={{ marginTop: '3px' }} />
        Send me game news and updates (you can unsubscribe any time)
      </label>
      <p style={{ fontSize: '12px', color: '#64748B', margin: '12px 0 0', lineHeight: 1.5 }}>
        By continuing you agree to the{' '}
        <a href="/terms" target="_blank" rel="noopener">
          Terms
        </a>{' '}
        and{' '}
        <a href="/privacy" target="_blank" rel="noopener">
          Privacy Policy
        </a>
        . No password: Google, Facebook or a one-time email link signs you in.
      </p>
    </Sheet>
  );
};

/** Settings › Account: who is signed in, game news, cloud saves, sign out, delete. */
export const AccountCard: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => {
  const { user, options, sync } = useAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!user) {
    if (!signInAvailable(options)) return null;
    return (
      <div className="account-card">
        <b>Account</b>
        <p>Sign in to keep your saves on every device.</p>
        <button className="ui-btn" onClick={onSignIn}>
          Sign in
        </button>
      </div>
    );
  }
  const via = user.providers.map((p) => PROVIDER_NAMES[p] ?? p).join(', ');
  return (
    <div className="account-card">
      <b>Account</b>
      <p>
        Signed in as <b>{user.name || user.email || 'Coach'}</b>
        {user.email && user.name ? ` · ${user.email}` : ''} · {via}
      </p>
      {options.cloudSaves && (
        <p style={{ color: sync.status === 'error' ? '#B91C1C' : '#15803D' }}>
          ☁️ Cloud saves {sync.status === 'syncing' ? 'syncing…' : sync.status === 'error' ? "couldn't sync: they'll retry on your next save" : sync.at ? `synced ${new Date(sync.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'on'}
        </p>
      )}
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', color: '#334155', margin: '8px 0' }}>
        <input
          type="checkbox"
          checked={user.marketing}
          onChange={async (e) => {
            const ok = await setMarketing(e.target.checked);
            setNote(ok ? null : "Couldn't save that. Try again.");
          }}
        />
        Send me game news and updates
      </label>
      {note && <p style={{ color: '#B91C1C' }}>{note}</p>}
      {confirmDelete ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '10px', fontSize: '14px', color: '#7F1D1D' }}>
          Delete your account, its cloud saves and its sign-ins? Saves on this device stay. This can&apos;t be undone.
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              className="ui-btn"
              style={{ background: '#DC2626', borderColor: '#DC2626', color: '#fff' }}
              onClick={async () => {
                const ok = await deleteAccount();
                setConfirmDelete(false);
                setNote(ok ? null : "Couldn't delete the account. Try again.");
              }}
            >
              Delete account
            </button>
            <button className="ui-btn" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
          <button className="ui-btn" onClick={() => void signOut()}>
            Sign out
          </button>
          <button className="ui-btn" style={{ background: '#FEF2F2', borderColor: '#FCA5A5', color: '#B91C1C' }} onClick={() => setConfirmDelete(true)}>
            Delete account
          </button>
        </div>
      )}
    </div>
  );
};

/** Settings › Cookies: the current choice and a way to change it. */
export const CookiesCard: React.FC = () => {
  const choice = useSyncExternalStore(subscribeConsent, cookieChoice);
  return (
    <div className="account-card">
      <b>Cookies</b>
      <p>
        Analytics: <b>{choice === 'analytics' ? 'allowed' : choice === 'necessary' ? 'off' : 'not chosen yet'}</b> ·{' '}
        <a href="/privacy" target="_blank" rel="noopener">
          Privacy Policy
        </a>
      </p>
      <button className="ui-btn" onClick={reopenCookieBanner}>
        Change cookie choice
      </button>
    </div>
  );
};

/** The account, on its own (from the title screen's pill). */
export const AccountSheet: React.FC<{ onClose: () => void; onSignIn: () => void }> = ({ onClose, onSignIn }) => (
  <Sheet title="Account" onClose={onClose}>
    <AccountCard onSignIn={onSignIn} />
  </Sheet>
);

const RESULT_TEXT: Record<string, [string, string]> = {
  ok: ['#15803D', 'Signed in.'],
  failed: ['#B91C1C', "Sign-in didn't work. Try again."],
  expired: ['#B91C1C', 'That sign-in link expired or was already used. Ask for a new one.'],
  unavailable: ['#B45309', "That sign-in option isn't available yet."]
};

/** How the last sign-in went, after the provider (or the email link) sent the player back. */
export const SignInResult: React.FC = () => {
  const { result, user } = useAccount();
  if (!result) return null;
  const [color, text] = RESULT_TEXT[result];
  return (
    <div role="status" className="account-result" style={{ borderLeftColor: color }}>
      <span style={{ color }}>{result === 'ok' && user ? `Signed in as ${user.name || user.email || 'Coach'}.` : text}</span>
      <button onClick={clearSignInResult} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
};
