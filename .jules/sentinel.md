## 2025-02-28 - FastAPI Wildcard CORS Vulnerability
**Vulnerability:** CORS configured with `allow_origins=["*"]` alongside `allow_credentials=True`.
**Learning:** This combination in FastAPI/Starlette doesn't error out on startup but dynamically reflects the incoming `Origin` header, bypassing CORS protections.
**Prevention:** Always explicitly list origins via environment variables when `allow_credentials` is True.
