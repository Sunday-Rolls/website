# Contact form email

How the Sunday Rolls contact form delivers mail in production.

## Current plan

| Item | Value |
|------|--------|
| Transport | **Resend** HTTPS API (`POST https://api.resend.com/emails`) |
| Railway plan | Hobby (paid) — **outbound SMTP is still blocked** |
| Resend plan | **Free forever** — 3,000 emails/month, 100/day |
| API service | `contact-api` → `https://contact-api-production-9af6.up.railway.app` |
| Site callers | GitHub Pages + future Railway `website` |
| Persistence | Postgres table `contact_messages` (always, even if email fails) |

Stay on Resend free until volume exceeds ~100 contact emails/day or 3,000/month. Do not switch back to Gmail SMTP on Hobby.

## Env vars (`contact-api`)

| Variable | Required | Notes |
|----------|----------|--------|
| `RESEND_API_KEY` | Yes (for inbox delivery) | Set in Railway only — never commit |
| `RESEND_FROM_EMAIL` | Recommended | `Sunday Rolls Contact <hello@sundayrollsgolf.com>` (also the code default) |
| `CONTACT_TO_EMAIL` | Yes | Where the team reads messages |
| `SMTP_*` | No on Hobby | Ignored when `RESEND_API_KEY` is set; only useful on Railway Pro+ |

## Frontend

The browser only needs `VITE_CONTACT_API_URL` (Railway API host). It does **not** use the Resend key.

## When you outgrow free

1. Upgrade Resend (Pro starts ~$20/mo), **or**
2. Move Railway to Pro+ and re-enable Gmail SMTP (not recommended — keep HTTPS email)

## Sender domain

`sundayrollsgolf.com` is verified in the Sunday Rolls Resend account; its DNS records (DKIM, SPF, `send.` MX) live in Cloudflare. Production sets:

```bash
RESEND_FROM_EMAIL=Sunday Rolls Contact <hello@sundayrollsgolf.com>
```

Don't use `onboarding@resend.dev`: Resend's test sender only delivers to the account owner.

The `sundayrollsdevops@gmail.com` inbox has a Gmail filter that skips the inbox and labels these emails **Contact** (matches the sender and `"Sunday Rolls Contact"` in the subject). Update it if the From address changes.

## Related

- [server/README.md](../server/README.md)
- [RAILWAY_CUTOVER.md](./RAILWAY_CUTOVER.md)
- Code: `server/src/mail.ts`, `server/src/contact-store.ts`
