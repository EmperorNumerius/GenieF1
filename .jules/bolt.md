## 2024-05-24 - Synchronous Network Clients in FastAPI
**Learning:** Using synchronous network clients (like `Groq`) inside `async def` endpoints blocks the main event loop, stalling concurrent tasks such as background polling and live WebSocket streams.
**Action:** Always use asynchronous clients (e.g., `AsyncGroq`) in these contexts to prevent blocking the event loop and ensure the application remains responsive.
