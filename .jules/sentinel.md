## 2025-01-01 - FastAPI CORS Middleware Vulnerability
**Vulnerability:** Overly permissive CORS configuration allowing all origins (`["*"]`) while also allowing credentials (`allow_credentials=True`).
**Learning:** In FastAPI/Starlette, combining `allow_origins=["*"]` with `allow_credentials=True` does not throw an immediate startup error but dynamically reflects the incoming `Origin` header. This effectively bypasses CORS protections, exposing the application to Cross-Site Request Forgery (CSRF) and other cross-origin data theft risks.
**Prevention:** Always explicitly list trusted origins via environment variables instead of using the wildcard `"*"` when `allow_credentials` is set to `True`.
