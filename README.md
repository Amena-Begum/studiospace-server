# StudioSpace Server

REST API for [StudioSpace](https://github.com/Amena-Begum/studiospace-client): Express, TypeScript and MongoDB.

## Endpoints

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| POST | /api/auth/register, /login, /google, /logout | – | Account and session (JWT in an HTTPOnly cookie) |
| GET | /api/auth/me | cookie | Restore the session on reload |
| GET | /api/studios?limit=&sort= | – | List studios |
| GET | /api/studios/:id | – | Studio details |
| GET | /api/studios/mine | cookie | Listings owned by the caller |
| POST, PUT, DELETE | /api/studios, /api/studios/:id | cookie | Create, update, delete (owner only) |
| POST | /api/bookings | cookie | Request a booking; rejects overlaps with confirmed bookings |
| GET | /api/bookings/mine | cookie | Bookings made, and requests on the caller's studios |
| PATCH | /api/bookings/:id/status | cookie | Guest cancels pending; host confirms, completes or cancels |

Unauthenticated calls to protected routes return `401 Unauthorized`.

## Setup

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI, JWT_SECRET, SEED_PASSWORD
npm run seed           # demo studios and accounts
npm run dev            # http://localhost:5000
```

In production the cookie is `HttpOnly; Secure; SameSite=None` so it also works across domains. Secrets live only in git-ignored `.env` files and Vercel environment variables.

## Image credits

Seed photographs and their licences are listed in `src/seed/images.json` and in the client README.
