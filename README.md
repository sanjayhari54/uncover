# Uncover V19 — chat inbox and premium UI foundation

## Included
- Chat navigation opens a proper inbox instead of arbitrarily opening the newest chat.
- Inbox shows compact chat rows, latest-message previews, recency, and a separate blocked-chat section.
- Selecting a connection opens the matching conversation by user ID.
- Connections and blocked members are separated in the UI.
- Premium visual polish and pricing-page copy.
- Existing Supabase auth/config files are included for this project. Keep your publishable key; never put a service-role key in browser files.

## Deploy
1. Download and extract the ZIP.
2. Review the files, then upload/replace the files in the root of your existing GitHub repository.
3. Commit the changes and wait for GitHub Pages to redeploy.
4. Open the site in a private/incognito window or hard-refresh with Ctrl+F5.
5. Test: open Chats without a query string, open a specific chat, send a message from both accounts, block a user, and check Connections.

## Important payment note
The pricing page is a presentation layer, not a live payment integration. Do not mark users premium from browser JavaScript. Real checkout requires a payment provider account, a server-side verification/webhook (for example, a Supabase Edge Function), and database-side premium activation. No payment is collected by this package.

## Database
This package does not automatically run SQL. Keep your existing database. Apply only reviewed migration SQL in Supabase; never run a destructive reset on production data.
