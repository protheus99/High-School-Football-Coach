import React, { useSyncExternalStore } from 'react';
import { cookieBannerOpen, setCookieChoice, subscribeConsent } from '../services/consent';

/** The first-visit cookie question: sign-in only, or analytics too. Two equal buttons; nothing loads before an answer. */
export const CookieBanner: React.FC = () => {
  const open = useSyncExternalStore(subscribeConsent, cookieBannerOpen);
  if (!open) return null;
  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookies">
      <b>Cookies</b>
      <p>
        We use one cookie to keep you signed in. With your OK we also use Google Analytics to see how the game is played.{' '}
        <a href="/privacy" target="_blank" rel="noopener">
          Cookie details
        </a>
      </p>
      <div className="cookie-banner-buttons">
        <button className="ui-btn" onClick={() => setCookieChoice('necessary')}>
          Only necessary
        </button>
        <button className="ui-btn" style={{ background: '#2563EB', borderColor: '#2563EB', color: '#fff' }} onClick={() => setCookieChoice('analytics')}>
          Allow analytics
        </button>
      </div>
    </div>
  );
};
