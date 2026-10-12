import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';

// The licensed MP3s in public/music are for the dev server only: the live game streams them from the music Worker,
// so they're removed from every build and can never be deployed with the site
function dropLicensedMusic(): Plugin {
  let outDir = 'dist';
  return {
    name: 'drop-licensed-music',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const dir = join(outDir, 'music');
      try {
        readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith('.mp3'))
          .forEach((f) => rmSync(join(dir, f)));
      } catch {
        // no music folder in this build
      }
    }
  };
}

// Google Analytics (gtag.js), right after <head> as Google asks. Only in the site build, so the dev server and local
// testing never show up in the statistics. It loads only once the player allows analytics cookies (the cookie banner,
// src/services/consent.ts): the page sets up gtag and a loader, and calls it at once for a player who already agreed.
const GOOGLE_TAG_ID = 'G-FE5ZDP3K2T';
const GOOGLE_TAG = `<!-- Google tag (gtag.js), after consent -->
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      window.fcAnalyticsId = '${GOOGLE_TAG_ID}';
      window.fcLoadAnalytics = function () {
        if (window.fcAnalyticsLoaded) return;
        window.fcAnalyticsLoaded = true;
        window['ga-disable-${GOOGLE_TAG_ID}'] = false;
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}';
        document.head.appendChild(s);
        gtag('js', new Date());
        gtag('config', '${GOOGLE_TAG_ID}');
      };
      try { if (localStorage.getItem('fc.cookieConsent') === 'analytics') window.fcLoadAnalytics(); } catch (e) {}
    </script>`;

function googleTag(): Plugin {
  return {
    name: 'google-tag',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>
    ${GOOGLE_TAG}`)
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), dropLicensedMusic(), googleTag()],
  worker: {
    format: 'es'
  },
  server: {
    port: 3000,
    open: true,
    // Accounts: the dev server hands /api/auth to the sign-in Worker running locally (`npx wrangler dev` in auth-worker/)
    proxy: { '/api/auth': 'http://localhost:8787' }
  },
  build: {
    target: 'es2020',
    sourcemap: true
  }
});
