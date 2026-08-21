# Dev Studio

Mobile-first coding agent interface connected to your laptop over Tailscale.

## Stack

- **Frontend:** React + TypeScript + Vite + CSS
- **Backend:** Node.js + Express (runs on your laptop)
- **Agent:** Antigravity CLI (`agy`) via Google account auth
- **Git:** Native git + simple-git
- **GitHub:** GitHub REST API (PAT on laptop)

## Quick start (frontend only)

```bash
npm install
npm run dev
```

## Full setup (phone + laptop)

See **[docs/LAPTOP_SETUP.md](docs/LAPTOP_SETUP.md)** for complete laptop configuration.

Summary:
1. Install `agy`, Tailscale on laptop
2. Authenticate `agy` on the laptop; add your GitHub PAT in phone Settings
3. Start backend: `DEV_STUDIO_TOKEN=xxx npm run dev:server`
4. Connect phone app via Settings → Tailscale URL + GitHub PAT

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend dev server |
| `npm run dev:server` | Backend dev server |
| `npm run build` | Build frontend |
| `npm run build:server` | Build backend |
| `npm run start:server` | Run backend (production) |

## Structure

```
src/           Frontend (React)
server/        Backend (Express, runs on laptop)
shared/types/  Shared TypeScript types
docs/          Setup documentation
```

## GitHub Pages

Frontend deploys to: https://evanstom273.github.io/dev-studio/

The backend runs locally on your laptop — not on GitHub Pages.
