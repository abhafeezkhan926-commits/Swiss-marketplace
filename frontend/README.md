# Frontend

This folder contains the standalone Next.js UI. It runs on port 3000 and uses a same-origin Next.js rewrite for `/api/*` to reach the backend.

1. Copy `.env.example` to `.env.local`.
2. Set `BACKEND_URL` (default `http://localhost:3001`).
3. Run `npm install` and `npm run dev`.

See the project-root README for full setup and deployment instructions. Do not put server secrets or MongoDB connection strings in this folder.
