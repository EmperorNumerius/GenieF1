## 2024-05-20 - Authorization Bypass in Development Endpoints
**Vulnerability:** The `/api/unlock_dev` endpoint allowed anyone to bypass session locks and gain access to AI insights in the production environment because it lacked an `ENVIRONMENT` check.
**Learning:** Development-only helper endpoints left accessible in production create trivial authorization bypass vectors. FastAPI does not automatically partition endpoints by environment.
**Prevention:** Always explicitly protect development endpoints by checking `os.getenv("ENVIRONMENT") != "production"`, or remove them entirely from production builds.
