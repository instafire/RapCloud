# RapR — Agent Guidelines

## Architecture
- **Node server** (`server.js`) is the active app — Express on port 3001, JSON-file storage via `lib/store.js` (`JsonStore`). No MySQL needed.
- **MySQL pool** in `db.js` is **unused** by Node. The PHP endpoints (`auth.php`, `feed.php`, etc.) use MySQL via `db.php` — these are legacy.
- All client logic is inline in `index.html` (Tailwind CDN, Hammer.js, Font Awesome, Montserrat font).
- Core lib: `lib/auth.js` (custom HMAC-sha256 tokens, not JWT) and `lib/store.js` (JSON CRUD + social features).

## Commands
- `npm install` — install deps
- `npm start` / `npm run dev` — `node server.js` on `0.0.0.0:3001`
- `npm test` — runs all `test/*.test.js` files via the built-in `node:test` runner
- `php -S localhost:8000` — serve PHP endpoints directly (legacy)

## Storage
Data files in repo root: `users.json`, `database.json` (videos), `social.json`, `messages.json`, `notifications.json`, `drafts.json`. These are auto-created with defaults by `JsonStore`. All writes are synchronous (single-threaded safe).

## Tests
Use `node:test` + `node:assert/strict`. No external test runner. Tests create temp dirs with `fs.mkdtempSync` and clean up with `fs.rmSync`. Run a single file: `node --test test/auth.test.js`.

## Conventions
- CommonJS (`require`/`module.exports`), 4-space indent, `camelCase` for JS, `snake_case` for API action names and DB fields.
- Upload limit: 200MB video via multer. Body limit: 2MB JSON/urlencoded.
- Auth tokens: custom HMAC-sha256 (30-day TTL). Include as `Authorization: Bearer <token>`.
- `normalizeHash` in `lib/auth.js` converts `$2y$` bcrypt prefix to `$2b$` for Node compat.
- Single `/api/interact` endpoint dispatches by `action` param (like, comment, follow, save, send_message, block, report, etc.).
- Video download via `/api/import` (URL → stream → VIDEOS/). Only standard-port HTTP(S) URLs resolving exclusively to public IPv4 addresses are accepted; redirects are revalidated. Max size: 200MB.

## Key Endpoints
- `GET /api/feed` — paginated feed (`limit`, `offset`)
- `GET /api/feed/recommended` — personalized feed (followed users → tag overlap → newest)
- `GET /api/feed/trending` — top tags by video count
- `GET /api/radio?genre=darkplugg` — shuffled genre radio
- `GET /api/chart?mode=daily|weekly|monthly&genre=ALL_CITY` — leaderboard
- `GET /api/challenge?tag=<tag>` — videos using a challenge tag
- `GET /api/profile/analytics` — own stats (drops, views, likes, saves, followers)
- `GET /api/video/analytics?id=<id>` — per-video analytics (views over time)
- `GET /api/drafts` — list drafts
- `POST /api/drafts/save` — save/update draft (supports `scheduled_at`)
- `DELETE /api/drafts/:id` — delete draft
- `GET /api/achievements` — own achievements + streak data
- `GET /api/beats` — browse beats (genre/BPM filters)
- `POST /api/beats/upload` — upload beat audio file
- `GET /artist/:username` — public artist profile (SEO, server-rendered HTML)
- `POST /api/interact` — all social actions via `action` field
- Socket.IO on same port — real-time notifications

## Social Actions (interact endpoint)
like, save, comment, get_comments, like_comment, delete_comment, follow, send_message, get_chats, get_messages, get_notifications, search_users, get_followers, get_following, delete_video, view, get_views, report, block, unblock, get_blocked, add_muted_word, remove_muted_word, request_verification, update_links, shoutout, invite_collab, admin_remove_video, admin_verify_user, get_sound_videos, request_beat, approve_beat, create_challenge, list_challenges, join_challenge, get_pending_requests

## Frontend Features
- **Video player**: draggable progress bar with waveform, tap-left/right skip (±10s), volume slider, keyboard shortcuts (Space/J/K/L/M/arrows), pre-buffering, mini-player for background audio
- **Video metadata**: song title, producer credit, lyrics overlay, original sound chip, watermark, duet badge
- **Feed modes**: "ALL CITY" (newest), "FOR YOU" (recommended), "RADIO" (shuffle by genre)
- **Auth**: login/register in-app, HMAC tokens, 30-day localStorage
- **Social**: swipe-right to like, pull-to-refresh, haptic feedback, toasts instead of alerts, loading skeletons
- **Profiles**: analytics tab (drops/views/likes/saves/followers), external links (SoundCloud, Spotify, etc.), tip link, mention badges, shoutout/collab buttons, streak display, achievement badges
- **Drafts**: save unfinished drops, schedule for later, publish from drafts list in studio
- **Collaborative drops**: multi-artist video credits with collab notifications
- **Charts**: DAILY/WEEKLY/MONTHLY tabs, genre-filtered, server-computed scores
- **Explore**: search users/tags, trending tags row with fire indicator, beats marketplace, challenges
- **Beats marketplace**: browse beats by genre, request to use, approve beat requests
- **Cypher challenges**: timed challenges, entry tracking
- **Moderation**: report video, block user, mute words
- **Admin**: reports dashboard, video removal, user verification (auto-enabled for configured users)
- **PWA**: service worker, manifest.json, installable
- **Socket.IO**: real-time notifications (with HTTP polling fallback)
- **Public artist profiles**: server-rendered HTML at `/artist/:username`, indexed by search engines

## Gotchas
- `.gitignore` excludes `node_modules/`, `uploads/`, `.env` files, and the generated `.auth-secret`. Root JSON runtime files are tracked; use isolated temporary directories in tests and never commit real credentials or account data.
- `dotenv` loads with `{ quiet: true }` in `server.js` — `.env` is optional.
- Only the `server.js` `buildApp({ store })` export is testable; direct start uses `require.main === main`.
- PHP auth tokens (`$2y$` bcrypt) will work with Node via `normalizeHash` conversion.
- In-memory rate limit: 10 req/10s on auth/upload, 100 req/10s general. 15-30s ban if exceeded.
- Admin users: `rapradmin` or comma-separated `ADMIN_USERS` env var.
