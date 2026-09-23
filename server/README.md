# Sunday Rolls contact API

Small Node (Hono) service that accepts Contact Us form posts and emails the team via Gmail SMTP (nodemailer). No Resend.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /contact` JSON `{ name, email, subject, message }` → `{ ok: true }`

## Local

```bash
cd server
cp .env.example .env   # fill SMTP_USER / SMTP_PASS
npm install
npm run dev
```

## Railway

1. Create a service with **Root Directory** = `server`
2. Set env vars from `.env.example` (`SMTP_*`, `CORS_ORIGINS`, `CONTACT_TO_EMAIL`, optional `CONTACT_API_KEY`)
3. Build: `npm run build` · Start: `npm start`
4. Generate a public domain; put it in the site’s `VITE_CONTACT_API_URL`

`CORS_ORIGINS` must include every site origin that hosts the form (local Vite + production Pages URL).

**Important:** Railway **Hobby / Trial / Free** blocks outbound SMTP (ports 465/587). Gmail SMTP only works on **Pro+**, or switch the server to an HTTPS email API (Resend, etc.). See [Railway outbound networking](https://docs.railway.com/networking/outbound-networking).

## Gmail App Password

1. Sign in as `sundayrollsdevops@gmail.com`
2. Enable 2FA → create an [App Password](https://support.google.com/accounts/answer/185833)
3. Use that value as `SMTP_PASS`
