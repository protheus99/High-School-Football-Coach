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
// testing never show up in the statistics.
const GOOGLE_TAG_ID = 'G-FE5ZDP3K2T';
const GOOGLE_TAG = `<!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', '${GOOGLE_TAG_ID}');
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
    open: true
  },
  build: {
    target: 'es2020',
    sourcemap: true
  }
});
