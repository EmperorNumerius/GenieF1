# GenieF1 — Live F1 Race Dashboard

GenieF1 is a full-stack Formula 1 dashboard that streams live telemetry via the LiveF1 SignalR API, provides an AI race engineer powered by Groq, runs Monte Carlo race outcome predictions, renders circuit maps using OpenStreetMap basemaps with hand-calibrated coordinates for all 24 circuits, and includes a full historical race and championship browser.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | FastAPI · livef1 (SignalR) · Groq AI (llama3-8b-8192) · Stripe · discord.py |
| **Frontend** | Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · MapLibre GL |

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # fill in GROQ_API_KEY etc.
python main.py
# → http://localhost:8000

# Frontend
cd frontend
pnpm install   # or npm install
pnpm dev       # → http://localhost:3000
```

## Features

- **Live telemetry stream** — car positions, speed, gear, throttle, brake, and DRS state via SignalR WebSocket
- **OSM track map** — MapLibre GL basemap with calibrated bounding boxes for all 24 Formula 1 circuits, with live car position overlays and trail rendering
- **Race-control broadcast ticker** — scrolling banner for safety-car calls, yellow flags, DRS enabled/disabled, and steward decisions
- **Gap chart** — animated interval chart showing time gaps between all drivers updated every 2 seconds
- **Weather panel** — live air temperature, track temperature, wind speed, humidity, and rainfall indicator
- **Lap counter** — current lap / total laps with session type label
- **DRS indicator** — per-driver DRS open/closed state with zone highlighting
- **Sector colours** — purple/green/yellow sector time colouring on driver cards
- **Sidebar standings** — sorted live driver standings with keyboard navigation and team colour strips
- **Historical race browser** — browse any past session from the current and previous seasons via the FastF1/livef1 API
- **Championship standings** — driver and constructor points tables
- **Monte Carlo predictor** *(in progress)* — simulates thousands of race finishes from current state to produce probabilistic podium predictions
- **Race engineer chat** *(in progress)* — natural-language interface to the Groq-powered AI race engineer with pit-window recommendations and tire-strategy calls
- **Anomaly detector** *(in progress)* — real-time scan of telemetry for unusual tyre degradation, ERS anomalies, and pace drops
- **Discord bot** — links a Discord channel to a dashboard session and broadcasts live AI insights every 15 seconds

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `WS` | `/ws/race_data` | Stream live race state as JSON every 2 s |
| `GET` | `/api/race_state` | One-shot snapshot of full race state |
| `GET` | `/api/telemetry` | Race state, optionally filtered by `?driver=` or `?driver_number=` |
| `GET` | `/api/session` | Resolved session info and LiveF1 API status |
| `GET` | `/api/status` | Service health — car count, data source, last update |
| `POST` | `/api/session/refresh` | Force immediate state refresh from the data store |
| `GET` | `/api/calendar` | All race meetings for `?year=` (defaults to 2026) |
| `GET` | `/api/insights` | AI race engineer insight (requires unlocked session) |
| `GET` | `/api/pit_projection` | Predicted re-entry position after a pit stop for `?driver_number=` |
| `GET` | `/api/yellow_flag_analysis` | Gap shuffle prediction under a safety-car deployment |
| `GET` | `/api/ers_prediction` | ERS battery impact forecast for `?driver_number=&laps_remaining=` |
| `GET` | `/api/overtake_simulation` | Laps-to-catch estimate for `?driver_number=&target_number=` |
| `GET` | `/api/tire_strategy` | Optimal tire strategy recommendation for `?driver_number=&laps_remaining=` |
| `POST` | `/api/webhook/stripe` | Stripe checkout webhook — unlocks AI insight sessions |
| `POST` | `/api/unlock_dev` | Dev-only session unlock (blocked in `ENVIRONMENT=production`) |

> AI endpoints (`/api/insights`, `/api/pit_projection`, etc.) require a valid `session-id` header corresponding to a Stripe-unlocked session.

## Project Structure

```
GenieF1/
├── backend/
│   ├── main.py              # FastAPI app — routes, WebSocket, Groq AI calls
│   ├── livef1_client.py     # SignalR LiveF1 data store and background thread
│   ├── simulation.py        # Pit-stop, overtake, ERS, tire strategy predictors
│   ├── monte_carlo.py       # Monte Carlo race outcome simulator
│   ├── anomaly.py           # Real-time telemetry anomaly detector
│   ├── race_engineer.py     # Groq chat session helpers
│   ├── bot.py               # Discord bot (discord.py)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js app router (layout, page, globals.css)
│   │   ├── components/      # React components
│   │   │   ├── TelemetryDashboard.tsx
│   │   │   ├── TrackMap.tsx / TrackMapInner.tsx / TrackMap3D.tsx
│   │   │   ├── SidebarStandings.tsx
│   │   │   ├── GapChart.tsx
│   │   │   ├── WeatherPanel.tsx
│   │   │   ├── LapCounter.tsx
│   │   │   ├── RaceControlBanner.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MiniSparkline.tsx
│   │   └── lib/
│   │       ├── circuits.ts  # 24-circuit OSM bounding-box calibration
│   │       ├── drivers.ts   # Driver colour/abbreviation lookup
│   │       └── constants.ts
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── next.config.ts
├── .env.example
├── .gitignore
└── README.md
```

## Environment Variables

Create `backend/.env` from `backend/.env.example`:

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key for llama3-8b-8192 inference |
| `STRIPE_SECRET_KEY` | Stripe secret key for webhook verification and checkout |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`) |
| `DISCORD_BOT_TOKEN` | Discord bot token for the race-insight broadcaster |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (default: `http://localhost:3000`) |
| `ENVIRONMENT` | Set to `production` to disable the `/api/unlock_dev` endpoint |

## License

MIT
