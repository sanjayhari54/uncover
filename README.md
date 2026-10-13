# Uncover V18

## Update
1. Extract this ZIP.
2. Upload/replace the included files in your existing GitHub repository and commit.
3. Hard refresh the site with Ctrl+Shift+R.

## Changes
- Dashboard chat list is a compact, single-row-per-person layout.
- Duplicate conversations are deduplicated by other user's ID, keeping the most recently active row.
- Blocked conversations are shown in a separate, closed section and cannot be opened from the dashboard.
- Blocked people are filtered out of normal Connections; a separate summary indicates how many people are blocked.
- No new SQL is required; uses the existing `blocks` table.
