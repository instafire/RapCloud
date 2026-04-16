# Repository Guidelines

## Project Structure & Module Organization
This repository uses a flat root layout. [`index.html`](/D:/Projects/rap.genznewz.com/index.html) contains the main client UI, including inline styles and browser-side JavaScript. [`server.js`](/D:/Projects/rap.genznewz.com/server.js) is the Express API and upload server, and [`db.js`](/D:/Projects/rap.genznewz.com/db.js) holds the Node MySQL pool. Legacy PHP endpoints such as [`auth.php`](/D:/Projects/rap.genznewz.com/auth.php), [`feed.php`](/D:/Projects/rap.genznewz.com/feed.php), [`interact.php`](/D:/Projects/rap.genznewz.com/interact.php), and [`finalize.php`](/D:/Projects/rap.genznewz.com/finalize.php) share [`db.php`](/D:/Projects/rap.genznewz.com/db.php). Media assets live in `VIDEOS/` and `PICTURES/`; deployment-facing directories include `.well-known/` and `cgi-bin/`. The Node server creates `uploads/` at runtime.

## Build, Test, and Development Commands
Run `npm install` to install the Node dependencies from [`package.json`](/D:/Projects/rap.genznewz.com/package.json). Use `node server.js` to start the Express API on port `3001`. If you need to exercise the PHP endpoints directly, serve the repo root with `php -S localhost:8000`. `npm test` is only a placeholder right now and exits with an error until a real test runner is added.

## Coding Style & Naming Conventions
Follow the existing 4-space indentation in JavaScript and PHP. Keep Node modules in CommonJS style (`require`, `module.exports`) unless you are converting an entire module. Use `camelCase` for JavaScript variables and functions, and preserve the existing `snake_case` pattern for API actions and DB-facing fields such as `get_comments` or `followers_count`. There is no committed ESLint, Prettier, or PHP_CodeSniffer config, so keep formatting manual and diffs focused.

## Testing Guidelines
No automated test suite or coverage threshold is committed in this checkout. For behavior changes, manually verify the affected flow against local MySQL-backed data: authentication, feed rendering, likes/comments, profile updates, and upload/finalize paths. If you add tests, either colocate them with the code they cover or introduce a dedicated `tests/` directory and wire it into `npm test`.

## Commit & Pull Request Guidelines
Git history is not available in this checkout, so there is no repository-specific commit convention to copy. Use short imperative commit subjects such as `Fix profile upload path` or `Add comment like endpoint`. Pull requests should explain the user-visible change, note any database or environment changes, and include screenshots or short recordings for UI edits in `index.html`.

## Security & Configuration Tips
Do not commit real credentials, production media, or generated `uploads/` artifacts. [`db.php`](/D:/Projects/rap.genznewz.com/db.php) currently contains inline database credentials, while [`db.js`](/D:/Projects/rap.genznewz.com/db.js) already expects environment variables; prefer the `.env` pattern for new work.
