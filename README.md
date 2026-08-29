# Uncover V4 — Supabase-connected MVP

This version connects the static Uncover frontend to Supabase Auth and the `profiles` table.

## Current real functionality
- Email/password sign up
- Email/password login
- Auth guard for app pages
- Automatic profile creation after login/session
- Server-side free-chat counter display from `profiles`
- Logout

## Supabase project
Configured for the Uncover Supabase project using the browser-safe publishable key.

## Important
The publishable key is intended for browser use. Never add a Supabase secret/service-role key to these files.

## Before launch
- Add production privacy policy and terms
- Verify 18+ age controls and moderation
- Implement server-side chat/usage enforcement
- Add Storage rules for photos
- Add real-time messaging
- Add mutual approval/reveal RPCs with strict RLS
- Connect a payment provider through a server/webhook flow


## V7
Fixed the Discover front-end renderer. It consumes the secure `discover_people` RPC, renders anonymous cards, and starts private chats through `start_private_chat` without exposing names or photos.


## V8
Added real chat loading, message sending, Supabase Realtime subscription, conversation membership verification, and fixed the Like button parameter mismatch.


## V9
Robust chat routing: validates the RPC conversation ID, constructs the chat URL with URLSearchParams, and recovers the newest conversation if the URL is missing or malformed.
