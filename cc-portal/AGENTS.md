# cc-portal Agent Instructions

## CRITICAL: Staging vs Production — Never use `supabase link`

`supabase link` silently overwrites `.temp/project-ref` and causes commands to hit the wrong environment. It is BANNED in this project.

**Always pass `--project-ref` explicitly:**

| Env | Supabase Project Ref | Firebase Hosting Target | URL |
|-----|---------------------|------------------------|-----|
| prod | `wzmtzpcqbaisqwjiigdx` | `creator-coders` | https://app.creatorcoders.com |
| staging | `qchdnaqyidtblrszqato` | `creator-coders-staging` | https://creator-coders-staging.web.app |

## Always Use the Deploy Scripts

Never construct ad-hoc `supabase` or `firebase` deploy commands. Use:

```bash
npm run deploy           # → scripts/deploy-prod.sh
npm run deploy:staging   # → scripts/deploy-staging.sh
npm run secrets          # → scripts/set-secrets-prod.sh
npm run secrets:staging  # → scripts/set-secrets-staging.sh
```

Each script has the project ref hardcoded. Read the script before running to confirm the target.

## Environment Files

- `.env` → prod Supabase (`wzmtzpcqbaisqwjiigdx`)
- `.env.staging` → staging Supabase (`qchdnaqyidtblrszqato`)
- Vite loads the right one via `--mode staging` flag

## Stripe

Both environments use the same `sk_test_...` key. The only differences are:
- `STRIPE_WEBHOOK_SECRET` — separate webhook endpoint per env
- `APP_URL` — prod vs staging URL for redirect after checkout
