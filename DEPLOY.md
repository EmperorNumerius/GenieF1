# Deployment Guide

GenieF1 is configured to be deployed on [Render.com](https://render.com) using the `render.yaml` Blueprint.

## Prerequisites

- A GitHub account with the GenieF1 repository.
- A Render.com account.
- Required API keys (Groq, Stripe, Discord).

## Steps to Deploy

1. **Push to GitHub**: Ensure your latest code is pushed to your GitHub repository.
2. **Connect to Render**: Go to your Render Dashboard -> Blueprints -> New Blueprint Instance.
3. **Select Repository**: Connect the GenieF1 repository.
4. **Configure**: Render will automatically read the `render.yaml` file and set up two services: `genief1-backend` and `genief1-frontend`.
5. **Environment Variables**: In the Render Dashboard, add the following environment variables (which are marked `sync: false` in the blueprint):
   - `GROQ_API_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `DISCORD_BOT_TOKEN`
6. **Wait for Build**: Render will build and deploy both services. The frontend will automatically be configured to connect to the backend URL via `NEXT_PUBLIC_API_BASE`.

## Domain Setup (Optional)

Once the services are live, you can attach custom domains via the Render Dashboard under each service's Settings -> Custom Domains.
