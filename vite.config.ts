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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), dropLicensedMusic()],
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
