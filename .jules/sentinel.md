## 2025-02-26 - Overly Permissive CORS Configuration
**Vulnerability:** The FastAPI backend used `allow_origins=["*"]` along with `allow_credentials=True`.
**Learning:** In modern frameworks like Starlette (which FastAPI uses), configuring CORS with a wildcard (`*`) while allowing credentials does not throw an error but rather reflects the incoming `Origin` header dynamically. This effectively bypasses CORS protections entirely, allowing any domain to perform authenticated cross-origin requests.
**Prevention:** Always restrict `allow_origins` to an explicit list of trusted domains when `allow_credentials` is enabled.
