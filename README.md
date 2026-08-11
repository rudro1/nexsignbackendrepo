# nexsignbackendrepo

NexSign backend — Node.js + Express + MongoDB + Cloudinary.

## Local dev

```bash
npm install
cp .env.example .env   # fill MONGO_URI, JWT_SECRET, Cloudinary, SMTP
npm run dev
```

Server: `http://localhost:5001`  
Health: `GET /api/health`

## Env vars

See `.env.example` for required variables.
