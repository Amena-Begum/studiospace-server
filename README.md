# Mohalla Events Server

REST API for the [Mohalla community events platform](https://github.com/Amena-Begum/studiospace-client): Express, TypeScript and MongoDB.

## Endpoints

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| POST | /api/auth/register, /login, /logout | – | Account and session (JWT in an HTTPOnly cookie) |
| GET | /api/auth/github | – | Start GitHub sign-in |
| GET | /api/auth/me | cookie | Restore the session on reload |
| PUT | /api/auth/profile | cookie | Update name and profile photo |
| GET | /api/events?limit= | – | Upcoming events only, soonest first |
| GET | /api/events/:id | – | Event details with participant count |
| GET | /api/events/mine | cookie | Events created by the caller |
| POST, PUT, DELETE | /api/events, /api/events/:id | cookie | Create, update, delete (creator only; dates must be in the future) |
| POST | /api/events/:id/join | cookie | Join an event (one join per person) |
| GET | /api/joins/mine | cookie | Events the caller has joined, sorted by event date |

Unauthenticated calls to protected routes return `401 Unauthorized`; changing someone else's event returns `403`.

## Setup

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI, JWT_SECRET, SEED_PASSWORD
npm run seed           # demo events and accounts
npm run dev            # http://localhost:5000
```

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to switch on GitHub sign-in (callback URL: `<client origin>/api/auth/github/callback`).

In production the cookie is `HttpOnly; Secure; SameSite=None` so it also works across domains. Secrets live only in git-ignored `.env` files and Vercel environment variables.

## Image credits

Seed photographs and their licences are listed in `src/seed/images.json` and in the client README.
