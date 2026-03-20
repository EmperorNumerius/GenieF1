## 2024-05-24 - Async Clients in FastAPI
**Learning:** Using synchronous network clients (like `Groq`) inside `async def` endpoints blocks the main event loop. This stalling prevents concurrent tasks such as background polling and live WebSocket streams from executing effectively in a framework like FastAPI.
**Action:** Always use asynchronous network clients (e.g., `AsyncGroq`) in `async def` endpoints to avoid blocking the event loop.
