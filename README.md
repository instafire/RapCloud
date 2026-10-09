# RapCloud 🎤⚡

> The underground rap platform built for independent artists and real hip-hop fans. Share vertical music videos, discover fresh talent, compete in beat battles, and climb the charts.

---

## 🌟 Overview

**RapCloud** (formerly RapR) is a fast, lightweight, community-first vertical video platform designed exclusively for the underground rap scene. No lip-syncing, no corporate algorithmic clutter—just raw rap videos, producer beats, battles, and real fan engagement.

### Key Features

- 📱 **Vertical Video Feed**: Smooth swiping experience with custom controls, waveform seeking (±10s skip), volume controls, keyboard shortcuts (`Space`, `J`, `K`, `L`, `M`, arrows), and background mini-player.
- 🎛️ **Multi-Feed Modes**:
  - **ALL CITY**: Newest drops from across the community.
  - **FOR YOU**: Personalized recommendation engine based on follows, shared tags, and engagement.
  - **RADIO**: Shuffle continuous playback by rap subgenre (Dark Plugg, Trap, Boombap, Drill, etc.).
- ⚔️ **Beat Battles & Cypher Challenges**: Timed community cyphers and head-to-head producer beat battles with audience voting.
- 🎹 **Beats Marketplace**: Producers can upload beats with BPM and genre tags; artists can request and license beats directly.
- 📈 **Daily, Weekly & Monthly Charts**: Dynamic leaderboard scoring based on views, likes, shares, and momentum.
- 🎨 **Creator Studio & Drafts**: Save unfinished drops, schedule posts for later, add lyrics overlays, producer credits, and tag collaborative artists.
- 💬 **Social & Community**: Direct messaging, nested comments, sound chips, shoutouts, saves, and artist verification.
- ⚡ **Real-Time Updates**: Socket.IO integration for instant notification of likes, follows, comments, and battle invites.
- 📲 **Installable PWA**: Service Worker caching and web app manifest for seamless mobile and desktop app experience.

---

## 🏗️ Architecture & Tech Stack

- **Backend**: Node.js & Express 5
- **Real-Time**: Socket.IO
- **Storage**: Synchronous persistent JSON flat-file storage (`lib/store.js`)
- **Authentication**: Custom HMAC-SHA256 session tokens with bcrypt password hashing
- **Frontend**: Lightweight HTML5/ES6, Tailwind CSS (via CDN), Hammer.js (gestures), Font Awesome
- **Testing**: Built-in `node:test` suite with `node:assert/strict`

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm`

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/instafire/RapCloud.git
   cd RapCloud
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the server**:
   ```bash
   npm start
   ```
   The app will start at `http://localhost:3001`.

4. **Run tests**:
   ```bash
   npm test
   ```

---

## ⚙️ Environment Variables (Optional)

RapCloud works out of the box for local development. If no development secret is set, it creates a private random `.auth-secret` file (mode `0600`) and reuses it across restarts. This local file is ignored by Git.

For production, set `NODE_ENV=production` and provide `AUTH_SECRET` with at least 32 random bytes. Startup fails closed if the secret is missing, too short, or a known placeholder. Generate one with `openssl rand -hex 32` and keep it in your deployment's secret manager, not in Git.

You can create a `.env` file to customize settings:

```env
PORT=3001
AUTH_SECRET=
ADMIN_USERS=rapradmin,yourusername
```

---

## 📂 Project Structure

```text
RapCloud/
├── lib/
│   ├── auth.js          # Password hashing and HMAC session tokens
│   └── store.js         # JSON database CRUD, social features & analytics
├── public/              # PWA assets (manifest.json, sw.js, robots.txt)
├── test/                # Node.js built-in test suite
├── index.html           # Single-page frontend application
├── server.js            # Express API server & Socket.IO handlers
├── package.json         # Project dependencies & scripts
└── AGENTS.md            # Technical specs & guidelines for AI assistants
```

---

## 📜 License

ISC
