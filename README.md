# Dev Studio

Mobile-first coding agent interface — frontend foundation.

## Stack

- React + TypeScript
- Vite
- CSS (no UI framework)

## Development

```bash
npm install
npm run dev
```

Open the local dev server URL shown in the terminal.

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages

The app is configured for GitHub Pages at `/dev-studio/`.

Live site: https://evanstom273.github.io/dev-studio/

Deployment runs automatically on pushes to `main` via GitHub Actions.

## Structure

```
src/
  components/   UI components
  pages/        Route-level views
  layouts/      (reserved for future layout shells)
  hooks/        Viewport and media query hooks
  services/     API boundary + mock data
  types/        Shared TypeScript types
  styles/       Global and component CSS
```

## Scope

This is the frontend foundation only. No backend, AI, or Antigravity integration yet.
