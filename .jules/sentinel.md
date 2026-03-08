## 2024-05-19 - Overly Permissive CORS with FastAPI/Starlette
**Vulnerability:** The FastAPI backend used `allow_origins=["*"]` in combination with `allow_credentials=True` inside `CORSMiddleware`.
**Learning:** Starlette (the underlying framework for FastAPI) handles `allow_origins=["*"]` + `allow_credentials=True` by dynamically reflecting the incoming `Origin` header in the `Access-Control-Allow-Origin` response header. This does not throw a startup error and completely bypasses CORS protections, putting the application at risk of CSRF and unauthorized cross-origin requests.
**Prevention:** Never use `allow_origins=["*"]` with `allow_credentials=True`. Always explicitly define allowed origins through configuration, environment variables, or a strict list of allowed domains.
