## 2024-05-18 - Overly Permissive CORS with Credentials
**Vulnerability:** CORS configuration used `allow_origins=["*"]` alongside `allow_credentials=True`.
**Learning:** Framework Behavior (FastAPI/Starlette): Configuring CORS with `allow_origins=["*"]` alongside `allow_credentials=True` does not throw a startup error but dynamically reflects the incoming `Origin` header, bypassing CORS protections. Origins should be explicitly listed via environment variables.
**Prevention:** Always use a specific list of allowed origins (e.g. read from an environment variable) when `allow_credentials=True` is required.
