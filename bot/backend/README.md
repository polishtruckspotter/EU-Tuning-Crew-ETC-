# Bot backend (API + WebSocket)

This folder contains a minimal Express + WebSocket backend used by the panel to read/update bot settings and receive real-time updates.

Run locally:

```bash
cd bot/backend
npm install
cp .env.example .env
# edit .env to set BOT_API_KEY and JWT_SECRET
npm run start
```

Notes:
- Use `BOT_API_KEY` as a long-lived secret that a trusted server (not public client JS) can exchange for a short-lived JWT via `/auth`.
- Panel should call `/api/*` endpoints with `Authorization: Bearer <token>`.
- Panels may open a WebSocket to `/ws?token=<jwt>` to receive real-time updates.
- Ensure `ALLOWED_ORIGIN` includes your Vercel panel URL to allow CORS.
