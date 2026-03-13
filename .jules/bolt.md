## 2024-05-24 - Sync IO Blocks FastAPI Event Loop
**Learning:** Using synchronous network clients (like `Groq`) inside an `async def` endpoint in FastAPI blocks the main event loop, stalling concurrent tasks like background polling or WebSocket streams.
**Action:** Always use asynchronous clients (e.g., `AsyncGroq`) inside `async def` endpoints when performing network I/O to avoid blocking the asyncio event loop.
