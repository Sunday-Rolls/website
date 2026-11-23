# Checking A/B testing after a deploy

Use this after A/B testing (PR #101) or a new test (e.g. `home-banner`, PR #89) goes live. Everything here runs against the real site, but **nothing adds visitors or exposures to a test**: the script only makes GET requests, and the browser test answers its own event beacons locally.

## 0. One-time setup (before the first deploy)

Each of these is a live change. Confirm before applying it. Full details are in README → "A/B tests".

| # | Where | What |
|---|-------|------|
| 1 | GitHub | Label `ab-test` |
| 2 | GitHub secret + Railway `contact-api` | `EXPERIMENTS_CI_TOKEN` (same value in both) |
| 3 | Railway `contact-api` | `GITHUB_DISPATCH_TOKEN` (fine-grained, this repo, Contents read/write) |
| 4 | Railway `website` | `EXPERIMENTS_CONFIG_URL=https://contact-api-production-9af6.up.railway.app/experiments/config` |
| 5 | GTM / GA4 | `exp_variants` variable and tag, `experiment_exposure` event, custom dimensions |
| 6 | Shopify purchase pixel | Add the version to the purchase event |

Without step 4 the site behaves exactly as before: no cookie and no test versions. Check 2 below fails with "EXPERIMENTS_CONFIG_URL is probably not set".

## 1. Before starting the test: preview links

On the PR preview or the live site, nobody is counted:

- `/?sr_force=home-banner:b` shows the Retro Roller banner under the value strip
- `/?sr_force=home-banner:control` shows the current home page with no banner
- `/?sr_force=clear` goes back to your real assignment

## 2. Start the test

Dashboard → **Experiments** → `home-banner` → **Start**. Only one test per page can run at a time, so stop `aa-check` first if it is running. The site picks the change up within about 30 seconds.

## 3. Run the checks

```bash
npm run experiments:verify -- --expect home-banner
```

```bash
npm run experiments:verify:browser
```

The first one needs no browser and checks:

1. `contact-api` `/experiments/config` answers and `home-banner` is `running`
2. A first visit gets a 180-day `sr_vid` cookie, `Vary: Cookie`, `Cache-Control: private`, and a `window.__SR_EXP__` whose version matches the coin flip computed locally from the same config
3. A return visit with that cookie gets no new cookie and the same version
4. Googlebot gets no cookie and no test version
5. Across 30 fresh visitors, every one gets the predicted version and both arms show up (`--sample 0` skips this)

The second one runs Chromium (`npx playwright install chromium` once) and checks:

- the forced `b` link shows the banner and the forced `control` link hides it
- a normal visit shows the version the server assigned, sends one exposure beacon with the right visitor and arm, pushes `experiment_exposure` to the dataLayer for GTM, and keeps the same version after a reload with no second exposure

Point either one somewhere else with `SITE_URL=…` (and `API_URL=…` for the script). Both exit non-zero on failure.

## 4. Check the dashboard (after a few hours of traffic)

Dashboard → Experiments → `home-banner`:

- Visitors are growing in **both** arms at roughly 50/50. A sample-split (SRM) warning means assignment or exposure logging is broken. Pause the test and investigate.
- Add-to-cart events show up per arm.
- After the first real order, it appears under one arm. Orders come from the Shopify sync through the hidden cart tags `_sr_vid` / `_sr_exp`. To check this on purpose without a real sale, run `npm run test:e2e:order-analytics` (read `docs/E2E_ORDER_ANALYTICS.md` first: it switches on the Bogus Gateway on the live store).

The result stays "too early" until 14 days and 1,000 visitors per arm.

## If something fails

| Symptom | Likely cause |
|---|---|
| No `sr_vid` cookie | `EXPERIMENTS_CONFIG_URL` missing on Railway `website`, or `website` not redeployed |
| Assignments `{}` but the config shows the test running | Site server hasn't polled yet (≤30 s) or can't reach `contact-api`. Check `website` logs for `experiments: config fetch failed` |
| Version differs from the predicted one | Site server and API disagree on the config (stale > 10 min returns `{}`) |
| Browser test: no exposure beacon | Built without a contact-api URL, or the test isn't `running` |
| Dashboard shows no visitors but the browser test passes | `POST /experiments/events` rejected on the real API. Check the `contact-api` logs and CORS (`CORS_ORIGINS`) |
