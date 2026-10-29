# Deploying GenieF1

This is a two-piece app:

- **Frontend** — Next.js static export, hosted on Cloudflare Pages
- **Backend** — Python FastAPI with WebSockets, hosted on Render (free tier)

The recommended setup uses two subdomains of the same root domain:

| URL | What | Hosted on |
|---|---|---|
| `f1.numeri.us` | Dashboard UI | Cloudflare Pages |
| `f1-api.numeri.us` | REST + WebSocket API | Render |

If your DNS is already on Cloudflare (it is for `numeri.us`), both custom domains are one click each.

---

## 1 · Deploy the backend to Render

1. Go to [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints) and click **New Blueprint Instance**.
2. Connect your GitHub account and pick the `EmperorNumerius/GenieF1` repo.
3. Render reads `render.yaml` at the repo root and proposes a service called `genief1-backend`. Click **Apply**.
4. Render builds and deploys. Watch the logs — first build takes ~3-5 min while it installs `livef1`, `fastapi`, `groq`, etc.
5. Once it's `Live`, set the secrets in the dashboard (Settings → Environment):
   - `GROQ_API_KEY` — required for AI race engineer chat
   - `STRIPE_SECRET_KEY` — only if you're using paid tiers
   - `STRIPE_WEBHOOK_SECRET` — only if you're using paid tiers
   - `DISCORD_BOT_TOKEN` — only if you're using the Discord bot
6. Render restarts the service automatically when env vars change.
7. Test it: open `https://genief1-backend.onrender.com/api/race_state` — you should see live JSON with 22 cars.

### Custom domain `f1-api.numeri.us`

8. In Render: Settings → Custom Domains → **Add Custom Domain** → `f1-api.numeri.us`.
9. Render shows you a CNAME target like `genief1-backend.onrender.com`.
10. In Cloudflare DNS for `numeri.us`:
    - Add a `CNAME` record: `f1-api` → `genief1-backend.onrender.com`
    - **Proxy status: DNS only (gray cloud)** — Cloudflare's proxy interferes with WebSocket upgrades and Render's TLS termination on free tier.
11. Wait ~30s for Render to verify, then ~1-2 min for cert provisioning.
12. Test: `https://f1-api.numeri.us/api/race_state` should serve the same JSON.

> ⚠ **Free-tier note:** Render free Web Services spin down after 15 min of inactivity. The first request after a sleep takes ~30s to wake. For always-on, upgrade to Starter (~$7/mo).

---

## 2 · Deploy the frontend to Cloudflare Pages

1. Go to [Cloudflare → Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) and click **Create** → **Pages** → **Connect to Git**.
2. Authorize Cloudflare for your GitHub if you haven't, and pick `EmperorNumerius/GenieF1`.
3. Configure the build:

   | Setting | Value |
   |---|---|
   | **Project name** | `genief1` (becomes `genief1.pages.dev`) |
   | **Production branch** | `main` |
   | **Framework preset** | `Next.js (Static HTML Export)` |
   | **Build command** | `cd frontend && npm install && npx next build` |
   | **Build output directory** | `frontend/out` |
   | **Root directory (advanced)** | leave blank (project root) |

4. **Environment variables (Production):**

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE` | `https://f1-api.numeri.us` |
   | `NODE_VERSION` | `20` |

5. Click **Save and Deploy**. First build takes ~2 min.
6. When done, your dashboard is live at `https://genief1.pages.dev`. Visit it to confirm.

### Custom domain `f1.numeri.us`

7. In your Pages project: **Custom domains** → **Set up a domain** → enter `f1.numeri.us`.
8. Because `numeri.us` is already a Cloudflare zone, Cloudflare auto-creates the CNAME for you. No manual DNS work.
9. SSL certificate is provisioned automatically (~1 min).
10. Visit `https://f1.numeri.us` — you should see the GenieF1 dashboard with live data streaming from `f1-api.numeri.us`.

---

## 3 · Continuous deploys

- Push to `main` → both Cloudflare Pages and Render auto-rebuild.
- Open a PR → Cloudflare Pages creates a unique preview URL for that branch.
- Render also supports preview environments on PRs (toggle in service settings).

---

## Troubleshooting

**Frontend loads but no race data shows up**
Open DevTools → Network. If `f1-api.numeri.us` requests fail with CORS errors, the backend's `ALLOWED_ORIGINS` doesn't include `https://f1.numeri.us`. Set it in Render env vars: `ALLOWED_ORIGINS=https://f1.numeri.us,http://localhost:3000`.

**WebSocket disconnects immediately**
Make sure your `f1-api.numeri.us` CNAME is **DNS-only (gray cloud)** in Cloudflare, not proxied (orange cloud). Cloudflare's proxy on free plans interferes with long-lived WebSocket upgrades through Render.

**Build fails on Cloudflare Pages with "lockfile mismatch"**
The repo uses pnpm; if Pages picks npm and the lockfile drifts, change the build command to `cd frontend && pnpm install && pnpm exec next build`.

**Render free dyno is too slow on cold start**
Set up [UptimeRobot](https://uptimerobot.com) to ping `https://f1-api.numeri.us/api/race_state` every 5 min. Keeps the dyno warm.
