## 2024-05-24 - AsyncGroq blocks main event loop
**Learning:** Using synchronous network clients (like `Groq`) inside `async def` endpoints in FastAPI blocks the main event loop. This stalling is particularly bad for concurrent tasks like background polling or live WebSocket streams, reducing the concurrent performance of the server.
**Action:** Always use asynchronous clients (e.g., `AsyncGroq`) when making network calls within `async def` endpoints to allow concurrent execution of requests and background tasks.
