## 2026-03-16 - Synchronous Groq client blocking FastAPI event loop
**Learning:** Using synchronous network clients like `Groq` inside `async def` endpoints blocks the main event loop, which stalls concurrent tasks such as background polling and live WebSocket streams.
**Action:** Always use asynchronous clients (e.g., `AsyncGroq`) with `await` in FastAPI `async` endpoints.
