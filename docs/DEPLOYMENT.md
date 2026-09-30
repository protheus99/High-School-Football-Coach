# Production Deployment & Hosting Guide

## 1. Local Development
```bash
npm install
npm run dev
```
Runs Vite dev server on `http://localhost:3000` with hot-module reloading and Web Worker support.

---

## 2. Production Static Build
```bash
npm run build
```
Compiles TypeScript, processes JSX into optimized chunks, bundles Web Workers into ES modules, and outputs static assets to `dist/`.

---

## 3. Recommended Static Hosts (Zero Configuration)
The application has zero server-side dependencies and can be deployed directly to any static web host:

* **Vercel:** `vercel --prod`
* **Netlify:** Drag and drop `dist/` or connect via GitHub webhook.
* **GitHub Pages:** Deploy `dist/` to `gh-pages` branch.
* **Cloudflare Pages:** Build command `npm run build`, output directory `dist`.

---

## 4. Progressive Web App (PWA) Installation
* Users can install the app directly on iOS Safari by tapping **"Share" $\rightarrow$ "Add to Home Screen"**.
* On Android Chrome or Desktop, click the **"Install App"** prompt in the address bar for a full-screen, native-style app experience.
