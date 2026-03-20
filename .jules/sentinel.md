## 2024-05-24 - FastAPI Overly Permissive CORS Reflection
**Vulnerability:** The application was configured with `allow_origins=["*"]` alongside `allow_credentials=True` in Starlette's `CORSMiddleware`.
**Learning:** In FastAPI/Starlette, using `allow_origins=["*"]` with `allow_credentials=True` doesn't throw a startup error. Instead, it dynamically reflects the incoming `Origin` header in the `Access-Control-Allow-Origin` response, fully bypassing CORS protections.
**Prevention:** Explicitly list allowed origins via environment variables instead of using the `*` wildcard when credentials are allowed.
