# Dev Studio — Laptop Backend Setup

This guide covers everything you need to configure on your **laptop** so Dev Studio on your phone can connect over Tailscale.

## Architecture

```
Phone (Dev Studio PWA)
  → Tailscale network
  → Dev Studio backend (this laptop, port 3847)
  → Git / GitHub CLI / Antigravity CLI (agy)
  → Your local repositories
```

**Credentials stay on the laptop.** The phone only stores:
- Backend URL (Tailscale hostname)
- Access token (optional shared secret)

---

## 1. Required software

Install on your laptop:

| Tool | Purpose | Install |
|------|---------|---------|
| **Node.js 20+** | Run the backend | [nodejs.org](https://nodejs.org) |
| **Git** | Repository operations | Preinstalled on most systems |
| **GitHub CLI (`gh`)** | GitHub repos, PRs | `brew install gh` / `sudo apt install gh` |
| **Antigravity CLI (`agy`)** | Agent sessions | [Antigravity CLI docs](https://www.antigravity.google/docs/cli/install/) |
| **Tailscale** | Private network | [tailscale.com](https://tailscale.com) |

---

## 2. Clone and install

```bash
git clone https://github.com/evanstom273/dev-studio.git
cd dev-studio
npm install
npm run build:server
```

---

## 3. Antigravity CLI authentication

**Use your Google account — NOT a Gemini API key.**

```bash
# First-time sign in (opens browser)
agy

# Verify headless mode works
cd ~/projects/your-repo
agy -p "Summarize this repo" --output-format stream-json
```

Important:
- Do **not** set `GEMINI_API_KEY` unless you intentionally want API billing
- Do **not** set `modelProvider: "gemini"` in `~/.gemini/antigravity-cli/settings.json`
- Your Google/Antigravity subscription limits apply as normal

---

## 4. GitHub CLI authentication

```bash
gh auth login
gh auth status
```

Follow the prompts to authenticate with your GitHub account.

---

## 5. Tailscale configuration

Both your **phone** and **laptop** must be on the same Tailscale tailnet.

1. Install Tailscale on both devices
2. Sign in with the same account
3. Enable **MagicDNS** in the Tailscale admin console (Settings → DNS)
4. Note your laptop's hostname, e.g. `my-laptop.tail-abc123.ts.net`

### Laptop power settings

The backend only runs when your laptop is awake:

- Disable sleep on AC power (System Settings → Power)
- Keep lid-closed behavior as "Do nothing" when plugged in

---

## 6. Backend configuration

Create a `.env` file in the project root (or export these variables):

```bash
# Required: shared secret between phone and laptop
DEV_STUDIO_TOKEN=your-long-random-token-here

# Optional (defaults shown)
DEV_STUDIO_HOST=0.0.0.0
DEV_STUDIO_PORT=3847
DEV_STUDIO_PROJECTS_ROOT=~/projects
DEV_STUDIO_DATA_DIR=~/.dev-studio
AGY_PATH=agy

# Auto-approve agent file edits/commands without phone prompt (optional, default: false)
# DEV_STUDIO_AUTO_APPROVE=true
```

Generate a token:

```bash
openssl rand -hex 32
```

---

## 7. Start the backend

```bash
# Development (auto-reload)
export DEV_STUDIO_TOKEN="your-token"
npm run dev:server

# Production
npm run build:server
DEV_STUDIO_TOKEN="your-token" npm run start:server
```

You should see:

```
Dev Studio backend listening on http://0.0.0.0:3847
Projects root: /home/you/projects
```

Verify from your laptop:

```bash
curl -H "Authorization: Bearer your-token" http://localhost:3847/api/health
```

Verify from your phone (with Tailscale connected):

```bash
curl -H "Authorization: Bearer your-token" http://my-laptop.tail-abc123.ts.net:3847/api/health
```

---

## 8. Connect Dev Studio on your phone

1. Open Dev Studio: https://evanstom273.github.io/dev-studio/
2. Tap **Settings**
3. Enter backend URL: `http://my-laptop.tail-abc123.ts.net:3847`
4. Enter the same access token as `DEV_STUDIO_TOKEN`
5. Tap **Save & Connect**

The status panel should show:
- Antigravity CLI: available + authenticated
- Git: Available
- GitHub CLI: Authenticated

---

## 9. Project discovery

The backend discovers repositories from:

1. **`DEV_STUDIO_PROJECTS_ROOT`** — scans subdirectories for git repos (up to 3 levels deep)
2. **Registered projects** — stored in `~/.dev-studio/projects.json`

From the phone you can also:
- **Init repo** — creates a new git repo at a laptop path
- **Clone** — clones a remote URL into projects root

---

## 10. Agent permission flow

When the agent wants to edit files or run commands:

1. Backend sends a permission request
2. Phone shows an **Allow / Deny** prompt
3. Backend continues or blocks the action

In **Ask mode**, write operations are always blocked.

To skip phone approval (use with caution):

```bash
DEV_STUDIO_AUTO_APPROVE=true
```

---

## 11. Security considerations

| Topic | Recommendation |
|-------|----------------|
| **Token** | Always set `DEV_STUDIO_TOKEN`. Use a long random value. |
| **Network** | Use Tailscale only. Do not expose port 3847 to the public internet. |
| **Auto-approve** | Leave disabled unless you trust all agent actions |
| **Delete repo** | Requires typing `owner/repo` exactly — destructive action |
| **Secrets** | Never enter Google/GitHub credentials in the phone app |

---

## 12. Troubleshooting

| Problem | Fix |
|---------|-----|
| Phone can't connect | Check Tailscale on both devices, verify laptop hostname and port |
| 401 Unauthorized | Token mismatch between phone and `DEV_STUDIO_TOKEN` |
| agy not authenticated | Run `agy` interactively and sign in with Google |
| gh not authenticated | Run `gh auth login` |
| Agent produces no output | Ensure `agy` works headless: `agy -p "test" --output-format stream-json` |
| Empty project list | Check `DEV_STUDIO_PROJECTS_ROOT` contains git repos |

---

## API reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Backend + tool status |
| `GET /api/projects` | List projects |
| `POST /api/agent/message` | Send prompt (SSE stream) |
| `GET /api/git/:id/status` | Git status |
| `GET /api/files/:id/tree` | File tree |
| `GET /api/github/:id/prs?state=open\|closed\|merged\|all` | List pull requests |
| `GET /api/github/:id/prs/:number` | PR detail (body, reviews, checks) |
| `POST /api/github/:id/prs` | Create PR (title, body, base, head, draft) |
| `PATCH /api/github/:id/prs/:number` | Edit PR title/body |
| `POST /api/github/:id/prs/merge` | Merge PR (merge/squash/rebase, delete branch) |
| `POST /api/github/:id/prs/close` | Close PR |
| `POST /api/github/:id/prs/:number/reopen` | Reopen PR |
| `PATCH /api/github/:id/repo` | Edit repo description, homepage, visibility |
| `DELETE /api/github/:id/repo` | Delete repo (requires confirmation) |
| `POST /api/run` | Run build/test commands |

Full implementation in `server/src/routes/`.
