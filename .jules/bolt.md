## 2025-03-09 - Asyncio Event Loop Blocking with Synchronous Clients
**Learning:** Using synchronous network clients (like `Groq`) inside `async def` endpoints in a FastAPI application blocks the main event loop, which stalls concurrent tasks such as background polling and live WebSocket streams.
**Action:** Always use asynchronous clients (e.g., `AsyncGroq`) inside `async def` endpoints when performing network operations to prevent blocking the event loop and to maintain the responsiveness of the application.
