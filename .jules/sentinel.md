## 2026-03-13 - FastAPI/Starlette CORS Misconfiguration
**Vulnerability:** The CORS middleware was configured with `allow_origins=["*"]` alongside `allow_credentials=True`.
**Learning:** In FastAPI/Starlette, this combination doesn't throw a startup error but dynamically reflects the incoming `Origin` header, bypassing CORS protections.
**Prevention:** Origins should be explicitly listed via environment variables instead of using the wildcard `*` when credentials are allowed.
