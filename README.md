# GenieF1 – Live F1 AI Race Engineer Dashboard

Real-time Formula 1 telemetry dashboard with AI race-engineer insights,
a Stripe paywall, and a Discord bot for live broadcasting.

---

## Architecture

```
GenieF1/
├── backend/          Python FastAPI – live telemetry, Groq AI insights, Stripe webhooks
├── frontend/         Next.js + Tailwind CSS – dashboard UI, paywall
└── discord_bot/      discord.py bot – broadcasts AI insights to Discord servers
```

---

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env      # fill in your keys
pip install -r requirements.txt
uvicorn main:app --reload
```

**Required environment variables** (see `backend/.env.example`):

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key for AI inference |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PAYMENT_LINK` | Stripe Payment Link URL (pay-what-you-want, min $2) |
| `REDIS_URL` | Optional Redis URL for session storage |
| `FRONTEND_URL` | CORS origin for the Next.js frontend |
| `OPENF1_SESSION_KEY` | OpenF1 session key for the current race weekend |

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local   # fill in NEXT_PUBLIC_API_URL
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Discord Bot

```bash
cd discord_bot
cp .env.example .env   # fill in DISCORD_BOT_TOKEN
pip install -r requirements.txt
python bot.py
```

**Slash commands:**

| Command | Description |
|---|---|
| `/link <token>` | Link a paid GenieF1 session to this server |
| `/unlink` | Stop broadcasting |
| `/status` | Show connection status |
| `/channel <name>` | Change the broadcast channel |

---

## How It Works

1. **Live data** – The backend polls the [OpenF1](https://openf1.org) REST API
   at ~1 Hz for sector times, tyre data, and gap information.  For local
   development the FastF1 library can replay historical sessions.

2. **AI insights** – Each telemetry snapshot is fed to the
   [Groq API](https://groq.com) (llama3-8b-8192) to generate concise,
   race-engineer–style insights with minimal latency.

3. **Paywall** – Clicking "Unlock Pro" creates a session token via the backend
   and redirects the user to a Stripe Payment Link with the token as
   `client_reference_id`.  The Stripe webhook calls `POST /stripe/webhook` and
   the backend unlocks the session.  Minimum payment is $2.

4. **WebSocket feed** – Paid users connect to `WS /ws/insights/<token>` to
   receive a real-time stream of AI insights for every lap.

5. **Discord bot** – Server admins run `/link <token>` with their paid session
   token.  The bot opens a WebSocket to the same endpoint and relays every
   insight to the configured channel as a rich embed.

---

## Running Tests

```bash
cd backend
pip install pytest httpx
pytest tests/ -v
```

---

## Stripe Setup

1. Create a **Payment Link** in the Stripe dashboard.
2. Enable "customer chooses price" with a minimum of **$2**.
3. Set `STRIPE_PAYMENT_LINK` to the Payment Link URL.
4. Configure a webhook endpoint pointing to `https://<your-domain>/stripe/webhook`
   and subscribe to the `checkout.session.completed` event.
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`.
