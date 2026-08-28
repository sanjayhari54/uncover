# Uncover MVP

Premium minimalist prototype for: **Talk first. Reveal later. Connect for real.**

## Included
- Responsive landing page
- Anonymous-first product concept
- Signup/login demo modals
- Private chat demo
- 3 free conversation counter using localStorage
- Like → mutual approval → profile reveal demo
- Free vs Plus pricing section
- Safety section
- Generated concept image in `assets/`

## Run locally
This is a static prototype, so you can open `index.html` directly. For a local server:

```bash
npx serve .
```

## Production architecture
Next.js + Supabase + Stripe + Vercel.

- Supabase Auth: accounts and sessions
- Supabase Postgres + RLS: profiles, conversations, likes, approvals, subscriptions
- Supabase Realtime: private chat
- Stripe: recurring Premium subscription
- Vercel: production deployment

## Important production rule
The 3-conversation limit must be enforced server-side in the database/API, not only in browser localStorage. Stripe subscription state should be verified by server-side webhooks before Premium access is granted.

## Suggested database entities
profiles, conversations, messages, likes, approvals, connections, subscriptions, reports, blocks.
