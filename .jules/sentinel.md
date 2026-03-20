## 2025-03-16 - FastAPI/Starlette CORS Reflection Behavior
**Vulnerability:** Overly permissive CORS configuration (`allow_origins=["*"]` alongside `allow_credentials=True`).
**Learning:** In FastAPI/Starlette, configuring CORS with a wildcard `*` for origins alongside `allow_credentials=True` does not throw a startup error but instead dynamically reflects the incoming `Origin` header. This effectively bypasses CORS protections, allowing any site to make credentialed requests.
**Prevention:** Always use explicitly listed `allow_origins` loaded from environment variables (e.g., `ALLOWED_ORIGINS`) and avoid using wildcards with credentials enabled.
