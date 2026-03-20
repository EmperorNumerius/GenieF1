## 2024-05-24 - Async IO in FastAPI
**Learning:** Using synchronous network clients (like Groq) inside async def endpoints blocks the main event loop, stalling concurrent tasks such as background polling and live WebSockets.
**Action:** Always use asynchronous clients (e.g., AsyncGroq) in these contexts and await their calls.
