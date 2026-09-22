# FORME.md — RapR

*Everything you need to understand this project, written for people who don't write code.*

---

## 1. The Big Picture

**RapR is a TikTok-style video platform built specifically for underground rap artists.** Think TikTok if it only cared about rap music — no dancing, no lip-syncing, no algorithm pushing content you didn't ask for. Just raw rap videos, daily charts, and a community that actually listens.

**Who is this for?** Two groups. First, underground rap artists who are tired of fighting TikTok's algorithm and want a place where their music is the point, not an afterthought. Second, rap fans who want to discover new artists without wading through a million non-music videos.

**The user journey is dead simple:**
1. Land on the website and see a bold black-and-red landing page
2. Create an account with a username and password (30 seconds, no email needed)
3. Swipe through a feed of vertical rap videos — tap to pause, swipe right to like, swipe up for the next one
4. Upload your own rap videos by recording, picking a file, or pasting a URL
5. Watch your views climb, appear on charts, collect followers, get shoutouts from other artists

**If RapR were a restaurant:** It's a speakeasy-style underground club that only plays rap music. There's no cover charge (free to join). Anyone can step up to the mic (upload a video). The DJ (the algorithm) plays tracks based on what the crowd actually reacts to, not what a corporate playlist tells them to play. There's a leaderboard on the wall showing who got the most head-nods today, this week, and this month. If you're good, people follow you to your next set. If you're great, other artists invite you to collab. There's no bouncer deciding who gets in — just real reactions from real people.

---

## 2. Technical Architecture — The Blueprint

Here's how the whole system fits together. Read this from top to bottom.

```
┌─────────────────────────────────────────────────────────────┐
│                        THE INTERNET                          │
│  (someone opens rap.genznewz.com on their phone or laptop)   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              WEB SERVER (Express on port 3001)               │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Front Desk  │  │  Kitchen     │  │  Bouncer         │   │
│  │  (static     │  │  (API routes)│  │  (rate limiter)  │   │
│  │   files)     │  │              │  │                  │   │
│  │  - index.html│  │  /api/feed   │  │  Max 10 req/10s  │   │
│  │  - robots.txt│  │  /api/auth   │  │  on auth/upload  │   │
│  │  - sitemap   │  │  /api/inter- │  │  Max 100 req/10s │   │
│  │  - VIDEOS/   │  │   act        │  │  for everything  │   │
│  │  - PICTURES/ │  │  /api/final- │  │  else            │   │
│  │              │  │   ize        │  │                  │   │
│  └──────────────┘  │  /api/drafts │  └──────────────────┘   │
│                    │  /api/import │                          │
│                    │  /api/chart  │                          │
│                    └──────┬───────┘                          │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              DATA (The Filing Cabinet)                        │
│                                                              │
│  All storage is plain JSON files in the project folder:      │
│                                                              │
│  users.json       → usernames, passwords (hashed), bios      │
│  database.json    → videos, captions, tags, comments          │
│  social.json      → likes, follows, saves, blocks, reports    │
│  messages.json    → direct messages between users             │
│  notifications.json → likes, follows, comments, shoutouts    │
│  drafts.json      → unfinished video uploads                  │
│                                                              │
│  There is NO database server. No MySQL. No PostgreSQL.       │
│  Just files on disk. Like a shoebox of index cards.         │
└─────────────────────────────────────────────────────────────┘
```

### A Tour of the Building

**The Front Desk** is everything the server sends to visitors without doing any real work. When you open RapR in a browser, the server hands you `index.html` — a single massive file (2,400+ lines) that contains the entire user interface, all the styles, and all the client-side logic. It also serves video files, images, and the PWA (Progressive Web App) files that let you install RapR on your phone's home screen.

**The Kitchen** is where the real work happens. Every action you take — liking a video, uploading a drop, sending a message — gets sent to one of the API routes. These are like numbered tickets at a deli counter. The kitchen processes each ticket, updates the filing cabinet, and sends back a response. Everything goes through a single master route called `/api/interact` that handles 30+ different actions. Think of it as a universal remote that does everything depending on which button you press.

**The Bouncer** is the rate limiter. It watches how many requests each visitor makes and slows them down if they're being abusive. Auth and upload attempts are limited to 10 requests per 10 seconds (prevents password guessing and spam uploads). Everything else gets 100 requests per 10 seconds. If someone exceeds the limit, they get a 15-30 second timeout. It's not perfect security, but it stops casual abuse.

**The Filing Cabinet** is all JSON files. This is the most unusual choice in the project. Instead of using a database (like MySQL or PostgreSQL), everything is stored in plain text files on the server's hard drive. Each file is a JSON object or array — essentially just formatted text that looks like a JavaScript object. When someone likes a video, the server reads the `social.json` file, adds the like, and writes the file back. It's like updating a spreadsheet by hand every time something changes.

### Why JSON Files Instead of a Database?

**Because it's simpler.** For the current scale (a handful of users, a few dozen videos), a database would be overkill. There's no database server to install, no connection strings to manage, no schema migrations to run. The whole data layer is about 800 lines of code in `lib/store.js`. You can read the entire database by opening a JSON file in any text editor.

**The trade-off:** This won't scale. If RapR gets thousands of active users, the JSON files will become a bottleneck. Every write operation locks the file (briefly), and if two people like a video at the exact same millisecond, one like could be lost. For an MVP (Minimum Viable Product) proving the concept works, this is the right call. For production at scale, you'd migrate to a real database.

### The Clever Bits

**The universal interact endpoint.** Most apps have separate endpoints for every action: `/api/like`, `/api/follow`, `/api/comment`, etc. RapR has ONE endpoint — `/api/interact` — and you tell it what to do with an `action` parameter. This is unusual but brilliant for rapid development: adding a new action means adding a few lines to the existing handler instead of creating a whole new route.

**Custom auth tokens.** Instead of using JWT (JSON Web Tokens, the industry standard), RapR uses a homegrown token system. It creates a message with your username and an expiration time, signs it with a secret key using HMAC-SHA256 (a cryptographic signature), and base64-encodes it (makes it URL-safe). It's JWT in spirit but simpler and with zero dependencies. The tokens expire after 30 days.

**No external services.** There's no Stripe for payments, no SendGrid for emails, no MongoDB Atlas for databases. The only external call the server makes is downloading videos from URLs. Everything else runs on the single Node.js process. This means zero monthly bills and zero third-party dependencies to break.

---

## 3. Codebase Structure — The Filing System

Here's what you'll find in the project folder:

```
rap.genznewz.com/
│
├── server.js              ← THE BRAIN — everything starts here
├── index.html             ← THE FACE — the entire user interface
├── package.json           ← THE SHOPPING LIST — what libraries we use
│
├── lib/                   ← THE TOOLBOX — reusable logic
│   ├── auth.js            ← Login, passwords, token creation
│   └── store.js           ← All data reading/writing
│
├── test/                  ← THE QUALITY INSPECTOR — automated tests
│   ├── auth.test.js       ← Tests for login/password system
│   ├── store.test.js      ← Tests for data storage
│   └── server.test.js     ← Tests for the web server
│
├── public/                ← THE DISPLAY CABINET — files served as-is
│   ├── manifest.json      ← PWA install info
│   ├── sw.js              ← Service worker (offline caching)
│   ├── robots.txt         ← Instructions for search engines
│   └── sitemap.xml        ← Map for search engines
│
├── VIDEOS/                ← THE VAULT — uploaded video files
├── uploads/               ← THE DOCK — temporary staging for uploads
├── PICTURES/              ← Profile pictures and headers
│
├── users.json             ← All user accounts
├── database.json          ← All videos
├── social.json            ← All social interactions
├── messages.json          ← All direct messages
├── notifications.json     ← All notifications
├── drafts.json            ← All saved drafts
│
├── *.php                  ← LEGACY — old PHP endpoints (not used)
├── db.php                 ← LEGACY — old database connection
├── db.js                  ← LEGACY — old MySQL connection (not used)
│
├── .env.example           ← Sample configuration file
├── AGENTS.md              ← Instructions for AI coding assistants
└── FORME.md               ← This document
```

### The Entry Points

**`server.js`** is where the app starts. When you run `npm start`, Node.js reads this file, sets up the Express web server, creates the data store, defines all the API routes, and starts listening for visitors on port 3001. Think of it as the main power switch.

**`index.html`** is what every visitor receives. It's not just HTML — it contains all the CSS (styling) and JavaScript (interactivity) inline. When a browser requests `rap.genznewz.com/`, the server sends this one file, and the browser does the rest. The JavaScript inside handles everything: showing the landing page, authenticating users, rendering the video feed, handling swipe gestures, playing videos, managing comments, and more.

**`lib/store.js`** is the heart of data management. Every time something needs to be saved or retrieved — a user, a video, a like, a message — it goes through this file. It's an 1,250-line class called `JsonStore` that knows how to read and write all six JSON data files.

### What to Open When...

- **Something's wrong with login?** → `lib/auth.js` (token creation/verification) or `server.js` line 254 (auth endpoint)
- **Videos aren't showing up?** → `lib/store.js` line 476 (`listFeed` method) or `server.js` line 294 (feed endpoint)
- **The look/feel needs changing?** → `index.html` lines 29-293 (all CSS styles) and the HTML structure below that
- **A social feature isn't working?** → `lib/store.js` (find the method by name like `likeVideo`, `toggleFollow`) and `server.js` line 491 (interact endpoint)
- **Need to see what data exists?** → Open any `.json` file at the project root

### Non-Obvious Files

**`db.js`** looks important (it connects to MySQL) but it's **completely unused by the running app**. It's left over from an older version. The Node.js server uses JSON files instead. Don't be confused by its existence.

**`*.php` files** are also legacy. This project originally had a PHP backend with a MySQL database. The Node.js version replaced it but the old files were never deleted. They still work if you serve them with PHP, but the active app ignores them.

**`AGENTS.md`** is instructions for AI coding tools (like Claude or Copilot). It tells them how the project is structured, what conventions to follow, and what gotchas to avoid. If you're working with an AI assistant on this codebase, it should read this file first.

---

## 4. Connections & Data Flow — How Things Talk to Each Other

Let's trace three core actions through the system. Each one tells a different story about how RapR works.

### Action 1: Someone Signs Up

This is the first thing every user does. Here's the full journey:

**Step 1: You land on the page and see a landing screen.**
The server sends you `index.html`. The JavaScript checks your browser's localStorage (a small storage area on your device) for a saved login token. There isn't one, so it shows the landing page — a sleek black-and-red page with "THE UNDERGROUND" in huge letters, a phone mockup playing a rap video, feature cards, and a signup form at the bottom.

**Step 2: You type in a username and password and click "JOIN THE UNDERGROUND."**
The JavaScript in `index.html` collects your username and password and sends them to the server. It constructs a POST request (like mailing a form) to `/api/auth` with an action of "register."

**Step 3: The server's kitchen gets the order.**
In `server.js` at line 254, the auth route handler runs. It:
1. Checks your username is 3-24 characters with only letters, numbers, and underscores
2. Checks your password is at least 8 characters
3. Looks in `users.json` to make sure nobody else has your username
4. Hashes your password using bcrypt (a one-way encryption — like putting your password through a meat grinder where you can't put it back together)
5. Creates your user account in `users.json` with the hashed password
6. Creates an auth token — a signed digital ID card valid for 30 days
7. Sends back: `{ success: true, token: "your-digital-id-card", user: { username: "you" } }`

**Step 4: The browser receives the ID card and saves it.**
The JavaScript stores the token in your browser's localStorage. Then it reloads the page. On reload, the JavaScript finds the token, decrypts it to verify it's valid, and hides the landing page. Now you're inside the app, looking at the video feed.

**What could go wrong?** If the server crashes during signup, your account might be created but you never get the token (you'd be stuck). The code handles this by requiring the token to be sent back before considering signup complete. If the `users.json` file gets corrupted (rare, but possible with simultaneous writes), signups could fail with strange errors.

---

### Action 2: An Artist Uploads a Video ("Drops a Track")

This is the core action — it's what the entire platform is built around.

**Step 1: The artist taps the + button to open the Studio.**
This switches the view in the app. They can record a video, pick a file from their device, or paste a URL to import from the internet.

**Step 2: They fill in the details and hit "PUBLISH."**
The form collects:
- The video file (or a reference to an imported video)
- A song title (optional, but encouraged)
- A producer credit (optional — rappers love crediting their producers)
- A caption describing the track
- Lyrics (optional — displayed as an overlay)
- Hashtags like #darkplugg or #jerk (these determine which genre charts the video appears on)

**Step 3: The video gets processed — two paths here.**

*Path A — File Upload:* The video file travels from the artist's device to the server. Multer (a file-upload library) catches it and places it in `/uploads/` — think of it as a loading dock. Then the code moves it to `/VIDEOS/` with a unique filename like `rap_1745382910_a1b2c3.mp4`.

*Path B — URL Import:* The artist pasted a URL. The server uses Axios (an HTTP client — think of it as a robot librarian that fetches things from the internet) to download the video. It checks that the file isn't too big (max 200MB) and saves it to `/VIDEOS/`.

**Step 4: The video metadata gets saved to the filing cabinet.**
The `addVideo` function in `lib/store.js`:
1. Creates a unique ID for the video
2. Creates a unique "original sound" ID (so other users can find videos using this same sound)
3. Scans the caption for @mentions (like `@producer_name`) and creates notifications for mentioned users
4. Saves everything to `database.json`

**Step 5: The artist sees their video in the feed.**
The server's response tells the browser the upload succeeded. The feed reloads, and the new video appears at the top (newest first).

**What could go wrong?** If the video file is corrupted or in an unsupported format (the app only accepts `.mp4`, `.mov`, `.webm`, `.m4v`, `.ogg`), the upload fails gracefully with an error message. If the download from a URL takes longer than 30 seconds, it times out. If the downloaded file is smaller than 1KB (basically empty), it gets deleted and an error is shown.

---

### Action 3: A Fan Likes a Video and Comments

This shows how social interactions work.

**Step 1: The fan is swiping through the feed. They see a video they like.**
They can tap the heart icon OR swipe right on the video (the swipe gesture triggers a "FIRE" stamp animation, then likes it).

**Step 2: The browser sends a "like" message to the server.**
The JavaScript calls `/api/interact` with `{ action: "like", id: "video-id-123" }`. Notice it uses the universal interact endpoint — the `action` parameter tells the server what to do.

**Step 3: The server updates social.json.**
The `likeVideo` method in `lib/store.js`:
1. Checks the user hasn't already liked this video (no double-likes)
2. Adds the like to the `videoLikes` array in `social.json`
3. Creates a notification for the video's owner: "username liked your drop"
4. Returns success

**Step 4: The fan taps the comment bubble and types "fire."**
Another call to `/api/interact` with `{ action: "comment", id: "video-id-123", text: "fire" }`.

**Step 5: The comment gets stored inside the video object in database.json.**
Unlike likes (which are stored in `social.json`), comments are stored directly inside each video's entry in `database.json`. This is a design choice — comments are always loaded with the video, so keeping them together is faster than looking them up separately.

**Step 6: The video owner gets a notification.**
`createNotification` adds an entry to `notifications.json`. The owner will see it next time they open the app (the app checks for new notifications every 10 seconds).

**Step 7 (optional): The fan can reply to a comment.**
Comments support threading — you can reply to a specific comment by passing a `parent_id`. Replies are indented below the parent comment in the UI.

**What could go wrong?** If the video is deleted while someone is commenting, the comment will fail because the video won't be found in `database.json`. The `addComment` method checks for this and returns an error. If the comment text is empty, it's rejected before anything is saved.

---

### How Auth Works — The Digital ID Card

When you log in, the server creates what's called an **auth token**. Think of it like a paper wristband at a festival:

1. **Creation:** The server takes your username and an expiration time (30 days from now), bundles them into a JSON object, base64-encodes it (turns it into safe text), and signs it with a secret key using HMAC-SHA256 (a cryptographic signature). The result looks like: `eyJ1IjoiYW1hbiIsImV4cCI6MTc0NTM4MjkxMH0=.signaturehere`

2. **Storage:** Your browser saves this token in localStorage. Every subsequent request to the server includes it in the HTTP header: `Authorization: Bearer eyJ1IjoiYW1hbiI...`

3. **Verification:** When the server receives a request, it:
   - Extracts the token from the header
   - Splits it into the payload and the signature
   - Re-computes the signature using the secret key
   - If the signatures match and the token hasn't expired, the request is authenticated

4. **Expiration:** Tokens last 30 days. After that, the user has to log in again. There's no refresh token mechanism — when your wristband expires, you go back to the entrance.

**Why custom auth instead of JWT?** JWT is the industry standard, but it requires a library. The custom implementation is about 50 lines of code with zero dependencies — it's just base64 encoding plus HMAC signing, both of which are built into Node.js. It achieves the same result with less complexity.

---

## 5. Technology Choices — The Toolbox

| Technology | What It Does Here | Why This One | Watch Out For |
|-----------|------------------|-------------|---------------|
| **Node.js** | The runtime that runs the server | JavaScript everywhere — same language for frontend and backend. Vast ecosystem. Free. | Single-threaded — one slow request can block others. Not ideal for CPU-heavy tasks. |
| **Express** | Web framework — handles routing, middleware, requests/responses | The most popular Node.js web framework. Massive community. Dead simple. | Version 5.x used here — newer than most tutorials assume. Some middleware doesn't work with Express 5 yet. |
| **JSON files** | Data storage (users, videos, social, messages, notifications, drafts) | Zero setup, zero cost, zero infrastructure. Readable by humans. Perfect for MVP. | Doesn't scale beyond ~100 simultaneous users. No concurrency protection. No querying — filtering happens in code. |
| **bcrypt** | Password hashing — one-way encryption | Industry standard for password storage. Salted automatically. Resistant to brute force. | Slow by design (takes ~700ms per hash). That's intentional — it makes password cracking harder. |
| **Multer** | File upload handling | Standard Express middleware for file uploads. Handles multipart forms. | Version 2.x works with Express 5. File size limit is configurable (currently 200MB). |
| **Axios** | HTTP client — downloads videos from URLs | Clean promise-based API. Handles redirects. Stream support for large files. | Only used for video import. If it fails, the user gets an error message. |
| **Hammer.js** | Touch gesture detection (swipe, tap, pan) | Lightweight, reliable, no dependencies. Handles the video feed swipe interaction. | Only loaded on the frontend. If it fails, swipe gestures break but tap buttons still work. |
| **Tailwind CSS** | Utility-first CSS framework (via CDN) | Fast prototyping. No build step needed (loaded from CDN). | CDN version limits some customization. All styles are inline utility classes. |
| **Font Awesome** | Icon library | Thousands of icons via CDN. Free tier covers everything used here. | Adds ~30KB to page load from CDN. |
| **Montserrat** | Google Font | Bold, modern, readable. Fits the underground aesthetic. | Free from Google Fonts. Adds ~15KB page load. |

### What's NOT Used

**MySQL** (`mysql2` package) is installed but not used by the Node.js server. It's a leftover from the PHP version. The `db.js` file creates a MySQL connection pool, but the running app never references it.

**Socket.IO** is installed but not used. It was intended for real-time features (instant messaging, live notifications) but the app uses polling instead (checking for new data every 3-10 seconds).

**Body-parser** is installed separately but Express 5 has built-in body parsing. Having both doesn't cause issues — the manual import just isn't used.

### Cost Implications

| Service | Cost | Notes |
|---------|------|-------|
| Node.js/Express | Free | Runs on any server. No licensing. |
| JSON file storage | Free | Just disk space. A million records would use ~500MB. |
| CDN libraries | Free | Tailwind, Hammer, Font Awesome, Google Fonts — all free tier. |
| SSL/HTTPS | Free | Let's Encrypt or Cloudflare. |
| Hosting | Varies | Needs a server with Node.js. Minimum ~$5-10/month (VPS or platform like Railway/Render). |

---

## 6. Environment & Configuration

A file called `.env` (hidden, not committed to the repository) controls how the server runs. The file `.env.example` shows you what to create:

```env
HOST=0.0.0.0        # Which network interface to listen on. 0.0.0.0 = all interfaces
PORT=3001           # Which port number. The server will be at http://your-server:3001
AUTH_SECRET=change-this-before-production  # The secret key for signing auth tokens
```

### What Each Setting Controls

**`HOST`**: Tells the server which network connection to use. `0.0.0.0` means "respond on all available network connections" — this is what you want for production. If you set it to `127.0.0.1`, the server would only respond to requests from the same computer.

**`PORT`**: The door number on the server. Think of it like an apartment number in a building. The server's address is `http://your-server:3001`. If you're running behind a reverse proxy (like Nginx), you'd set this to an internal port and let Nginx handle the public-facing port 80 or 443.

**`AUTH_SECRET`**: The master key for your auth system. This is used to sign auth tokens so they can't be forged. **If someone gets this key, they can create valid login tokens for any username — they'd be able to impersonate anyone.** In production, this should be a long random string (at least 32 characters). The default value (`development-secret-change-me`) is intentionally weak so it's easy to spot if someone forgets to change it.

### If You Need to Change...

**The server port** → Update `PORT` in `.env` (or the `PORT` environment variable on your hosting platform).

**How long auth tokens last** → Open `lib/auth.js`, find line 4: `const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;`. Change the `30` to however many days you want.

**The maximum upload size** → Two places: `server.js` line 38 (`MAX_DOWNLOAD_SIZE`) and line 180 (`fileSize: 200 * 1024 * 1024`). Change both numbers. The value is in bytes — `200 * 1024 * 1024` = 200MB.

**Which users are admins** → Set `ADMIN_USERS` in `.env` as a comma-separated list (e.g., `ADMIN_USERS=rapradmin,username2`). The default admin is `rapradmin`. Admins can view reports, remove any video, and verify user accounts.

**Rate limits** → In `server.js` lines 222-225. The format is `rateLimit(maxRequests, timeWindowMs, banDurationMs)`. For example, `rateLimit(10, 10000, 30000)` means "10 requests max, in a 10-second window, with a 30-second ban."

### Local Development Setup

1. Install Node.js (version 18 or later)
2. Clone the repository
3. Run `npm install` (installs all dependencies from `package.json`)
4. Copy `.env.example` to `.env` (optional — the server works without it)
5. Run `npm start` (starts the server on port 3001)
6. Open `http://localhost:3001` in your browser

The JSON data files are created automatically when the server starts if they don't exist. There's no database setup, no migration scripts, no seed data needed.

---

## 7. Lessons Learned — The War Stories

### Bugs That Bit Us

**The Phantom Mute Button.** After a major frontend refactor that replaced the mute toggle with a volume slider, the old `updateMuteIcon` function was removed... but the video card template still called it. Every time a new video loaded, the browser threw a `ReferenceError` — the function simply didn't exist anymore. The fix was to replace the function call with the new `updateVolumeIcon` function, which handles both mute state and volume levels. The lesson: when renaming or removing functions, grep everywhere they're called first.

**The Video-That-Wouldn't-Unmute.** The `setupPlayer` function (which initializes a video when it appears) forcefully set `vid.muted = false` every time. But the app had a global mute setting (`state.isGlobalMuted`) that was supposed to keep videos muted. Result: videos always started unmuted regardless of user preference. The fix was to make `setupPlayer` respect the global state instead of overriding it. The lesson: never hardcode a state value in a setup function — always read from the shared state.

**The Sound Sheet That Went Nowhere.** The "Original Sound" feature opened a bottom sheet showing other videos using the same sound. Clicking one called `playSpecificSoundVideo()`, which... did nothing. It cleared a cache variable and switched to the home view, but never actually played the clicked video. The fix required two changes: cache the fetched videos in a module-level variable, and have the play function populate the feed with those videos before switching views. The lesson: stubs and placeholders have a way of making it to production. If you write a function that doesn't do its job yet, mark it with a clear TODO.

**The Async Write Debacle.** The first attempt at concurrency-safe file writes used an async queue that wrote files in sequence (to prevent data corruption from simultaneous writes). But the initial file creation in the constructor used the same async function — and didn't await it. The files weren't written before the code tried to read them. The fix: revert to synchronous writes. Node.js is single-threaded, so two JavaScript operations literally cannot run at the same time. Synchronous writes are safe at this scale. The lesson: premature optimization (worrying about a problem you don't have yet) adds complexity without benefit.

### Pitfalls & Landmines

**The `.env` file is optional.** The server uses `dotenv` with `{ quiet: true }`, which means it won't complain if `.env` doesn't exist. This is helpful for development but dangerous for production — if you forget to set `AUTH_SECRET`, it silently uses `development-secret-change-me`.

**PHP files are publicly accessible.** The PHP legacy endpoints still work and are reachable at `auth.php`, `feed.php`, etc. They connect to a MySQL database that may or may not exist. They should be blocked via `robots.txt` (done) and ideally removed or password-protected.

**No `.gitignore` file exists.** There's nothing preventing `node_modules/`, `uploads/`, or `.env` from being committed to the repository. If you use git, create a `.gitignore` with at minimum:
```
node_modules/
uploads/
.env
```

**The "FOR YOU" feed needs user activity to work.** If a new user hasn't liked or followed anyone, the recommended feed falls back to showing the newest videos. It's not broken — there's just nothing to personalize yet. The feed gets better as you use the app more.

**Rate limits are per-server-process, not per-user.** If you restart the server, all rate limit counters reset. If you run multiple server instances behind a load balancer, each instance has its own counters (a user could make 100 requests to instance A and 100 to instance B without being limited).

### What We'd Do Differently

**Start with a real database.** JSON files were great for the first prototype, but they add friction for every feature that needs data relationships. Want to show "artists who liked this video also liked these"? That's a cross-file query that requires loading and filtering multiple JSON files in code. In SQL, it's a JOIN. The MVP justification holds, but the migration to a database should happen before the user base grows.

**Split index.html into separate files.** The single-file approach (HTML + CSS + JS all in one 2,400-line file) was fast for prototyping but is now a maintenance burden. Finding the right line to edit is like finding a specific sentence in a novel without a table of contents. A build step with separate `.html`, `.css`, and `.js` files would make development significantly faster.

**Use a proper test database.** The tests use temporary directories created with `fs.mkdtempSync` and cleaned up with `fs.rmSync`. This is clever but means tests can't easily debug failures by inspecting the data files afterward. A test mode that writes to a persistent test directory would make debugging easier.

### Engineering Wisdom That Emerged

**One endpoint for everything works surprisingly well.** The single `/api/interact` endpoint that dispatches by action parameter proved to be a productive pattern. Adding a new social feature means adding one method to the store and one `if` block to the endpoint — no routing, no URL design, no new file. For rapid iteration, this is gold.

**Optimistic UI updates make the app feel fast.** When you tap the like button, the counter increments immediately — the server request happens in the background. If the request fails, the counter decrements back. This makes the app feel instant even on slow connections. The pattern is used for likes, follows, saves, and comments.

**JSON file writes should always use a temp file then rename.** This prevents corruption: if the server crashes mid-write, only the `.tmp` file is corrupted. The original file remains intact. This pattern is used consistently in `lib/store.js` (the `writeJson` function).

---

## 8. Quick Reference Card

### How to Run the Project

```bash
# First time setup
npm install                    # Install all dependencies

# Run the server
npm start                      # Starts on http://localhost:3001
# OR
npm run dev                    # Same thing — start and dev are identical

# Run tests
npm test                       # Runs all 14 automated tests

# Run a single test file
node --test test/auth.test.js  # Just the auth tests

# Serve the old PHP endpoints (legacy, probably not needed)
php -S localhost:8000          # Serves PHP files on port 8000
```

### Key URLs

| URL | What It Is |
|-----|-----------|
| `http://localhost:3001` | The app (local development) |
| `http://localhost:3001/api/health` | Health check — returns `{"ok":true}` |
| `http://localhost:3001/robots.txt` | Search engine instructions |
| `http://localhost:3001/sitemap.xml` | Search engine sitemap |

### When Something Breaks

| Problem | Check First |
|---------|-------------|
| Server won't start | Is port 3001 already in use? Run `npm start` and watch for error messages |
| Login doesn't work | Check `users.json` exists and isn't corrupted. Check `AUTH_SECRET` hasn't changed. |
| Videos won't upload | Check `VIDEOS/` directory exists. Check disk space. Check file is under 200MB. |
| Feed is empty | Check `database.json` has entries. Check genre filter isn't excluding everything. |
| Tests fail | Run `npm test` and read the first error. Tests create temp directories so they shouldn't interfere with real data. |
| Weird behavior after changes | Did you restart the server? Node.js doesn't auto-reload. Ctrl+C and `npm start` again. |

### Most Common Tasks

**Add a new social feature** (like "boo" as a negative reaction):
1. In `lib/store.js`: Add a `booVideo` method (follow the pattern of `likeVideo`)
2. In `server.js` line 491: Add an `if (action === 'boo')` block in the interact endpoint
3. In `index.html`: Add a boo button UI and wire it to call `/api/interact` with `action: "boo"`
4. Add test in `test/store.test.js`

**Change the UI color scheme:**
1. All colors are in `index.html` CSS (lines 29-293)
2. Search for hex colors like `#ef4444` (red), `#0a0a0a` (near-black), `#111` (card backgrounds)
3. A design tokens section at the top of the CSS would be a nice improvement

**Add a new data field to video metadata** (like "BPM" for beats per minute):
1. In `lib/store.js`: Add `bpm` to `normalizeVideo` (line 90) and to the `addVideo` method (line 1156)
2. In `server.js`: Add `bpm` to the `/api/finalize` endpoint (line 444)
3. In `index.html`: Add a BPM input field in the finalize form, display it in the video card
