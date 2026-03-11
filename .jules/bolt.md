## 2024-03-11 - Blocking Synchronous LLM Calls in FastAPI

**Learning:** Using synchronous network clients (like `Groq`) inside `async def` endpoints blocks the main event loop in FastAPI. This stalls concurrent tasks such as background polling and live WebSocket streams, leading to degraded performance and delayed data.
**Action:** Always use asynchronous clients (e.g., `AsyncGroq`) inside `async def` route handlers when interacting with external APIs to allow FastAPI's event loop to run unhindered.
