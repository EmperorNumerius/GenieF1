# GenieF1

GenieF1 is a professional, production-ready Formula 1 live telemetry and AI race engineer platform. It provides a real-time dashboard powered by live telemetry data and offers AI insights, simulations, and historical data analysis.

## Architecture

```text
+-------------------+       +-------------------+       +-------------------+
|                   |       |                   |       |                   |
|   LiveF1 (F1      +------>+   FastAPI         +<----->+   Next.js 15      |
|   SignalR API)    |       |   Backend         |   WS  |   Frontend        |
|                   |       |   (Python 3.12)   |       |   (React 19)      |
+-------------------+       +--------+----------+       +-------------------+
                                     |
                                     v
                            +-------------------+
                            |                   |
                            |   Groq AI         |
                            |   (llama3-8b)     |
                            |                   |
                            +-------------------+
```

## Features

- **Live Telemetry Dashboard**: Real-time track map, driver standings, gaps, and weather data.
- **AI Race Engineer**: Context-aware AI insights based on the live race state.
- **Simulations**: Pit stop projections, ERS impact analysis, and overtake simulations using Monte Carlo methods.
- **Historical Data**: Browse past sessions and lap times.
- **Discord Bot**: Companion bot for broadcasting insights.

## Tech Stack

- **Backend**: Python 3.12, FastAPI, `livef1` (SignalR), Groq AI, Stripe, `discord.py`
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, MapLibre GL
- **Data**: FastF1 (historical), `livef1` (live)

## Local Development

### Prerequisites

- Python 3.12+
- Node.js 20+
- `pnpm`

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd genief1
   ```

2. Environment Variables:
   Copy `.env.example` to `.env` and fill in the required keys.

3. Backend Setup:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt
   ```

4. Frontend Setup:
   ```bash
   cd frontend
   pnpm install
   ```

### Running Locally

Use the provided `Makefile`:

- **Backend**: `make dev-backend`
- **Frontend**: `make dev-frontend`

The application will be available at `http://localhost:3000`.

## API Endpoints Reference

See the interactive API docs at `http://localhost:8000/docs` when the backend is running.

## Deployment

See [DEPLOY.md](DEPLOY.md) for Render.com deployment instructions.
