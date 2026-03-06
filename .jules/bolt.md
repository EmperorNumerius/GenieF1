## 2024-05-18 - Async Event Loop Blocking
**Learning:** In FastAPI, using synchronous network clients (like the default `Groq` client) inside `async def` endpoints blocks the entire event loop. This delays background tasks, stalls WebSockets, and reduces concurrency to 1.
**Action:** Always use async clients (e.g., `AsyncGroq`) in `async def` endpoints, or define the endpoint as synchronous `def` so FastAPI can offload it to a worker thread.
