.PHONY: dev-backend dev-frontend lint test

dev-backend:
	cd backend && python main.py

dev-frontend:
	cd frontend && pnpm dev

lint:
	cd frontend && pnpm lint

test:
	pytest backend/ --ignore=backend/test_sessions.py --ignore=backend/test_drivers.py
