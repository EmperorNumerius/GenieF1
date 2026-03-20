## 2024-05-23 - FastAPI/Starlette CORS Wildcard with Credentials
**Vulnerability:** The backend was configured with `allow_origins=["*"]` along with `allow_credentials=True` in `CORSMiddleware`.
**Learning:** In FastAPI/Starlette, this configuration does not throw a startup error. Instead, it dynamically reflects the incoming `Origin` header to bypass CORS protections.
**Prevention:** Always explicitly list allowed origins via environment variables instead of using wildcards when credentials are required.

## 2024-05-23 - Unauthenticated Development Unlock Endpoint
**Vulnerability:** An unauthenticated `/api/unlock_dev` endpoint allowed session unlocking without any checks, serving as a potential authorization bypass in production.
**Learning:** Development endpoints that override or bypass security checks can be forgotten and deployed to production.
**Prevention:** Add environment checks (e.g., `if os.getenv("ENVIRONMENT") == "production": raise 403`) to ensure development-only endpoints cannot be exploited in production.
