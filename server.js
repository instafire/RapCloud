require('dotenv').config({ quiet: true });

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { createServer } = require('http');
const { Server } = require('socket.io');

const {
    createAuthToken,
    hashPassword,
    normalizeUsername,
    validatePassword,
    validateUsername,
    verifyAuthToken,
    verifyPassword
} = require('./lib/auth');
const {
    JsonStore,
    normalizeMediaPath,
    normalizeTags
} = require('./lib/store');

const ROOT_DIR = __dirname;
const INDEX_FILE = path.join(ROOT_DIR, 'index.html');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const VIDEOS_DIR = path.join(ROOT_DIR, 'VIDEOS');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const PICTURES_DIR = path.join(ROOT_DIR, 'PICTURES');
const BEATS_DIR = path.join(ROOT_DIR, 'BEATS');
const WELL_KNOWN_DIR = path.join(ROOT_DIR, '.well-known');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3001);
const AUTH_SECRET = process.env.AUTH_SECRET || 'development-secret-change-me';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.ogg']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const MAX_DOWNLOAD_SIZE = 200 * 1024 * 1024;

function ensureDirectories() {
    [VIDEOS_DIR, UPLOADS_DIR, PICTURES_DIR, BEATS_DIR].forEach((dirPath) => {
        fs.mkdirSync(dirPath, { recursive: true });
    });
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

function buildFilename(prefix, extension) {
    const safeExtension = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExtension}`;
}

function normalizeFileExtension(originalName, mimeType, allowedExtensions, fallbackExtension) {
    const parsedExtension = path.extname(originalName || '').toLowerCase();
    if (allowedExtensions.has(parsedExtension)) {
        return parsedExtension;
    }

    const mimeMap = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'video/webm': '.webm',
        'video/x-m4v': '.m4v',
        'video/ogg': '.ogg'
    };

    const mappedExtension = mimeMap[mimeType];
    if (mappedExtension && allowedExtensions.has(mappedExtension)) {
        return mappedExtension;
    }

    return fallbackExtension;
}

function isLocalProjectPath(filePath) {
    return typeof filePath === 'string' && path.resolve(filePath).startsWith(ROOT_DIR);
}

function safeUnlink(filePath) {
    if (!filePath || !isLocalProjectPath(filePath) || !fs.existsSync(filePath)) {
        return;
    }

    fs.unlinkSync(filePath);
}

function getBearerToken(req) {
    const authHeader = req.get('authorization') || '';
    return authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';
}

function getAuthenticatedUsername(req) {
    const token = getBearerToken(req);
    return verifyAuthToken(token, AUTH_SECRET);
}

function requireAuth(req, res, next) {
    const username = getAuthenticatedUsername(req);
    if (!username) {
        return res.status(401).json({ success: false, message: 'Please log in again.' });
    }

    req.authUser = username;
    return next();
}

async function downloadVideoFromUrl(videoUrl) {
    let parsedUrl;
    try {
        parsedUrl = new URL(String(videoUrl || '').trim());
    } catch {
        throw new Error('Paste a valid direct video URL.');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only http and https video URLs are supported.');
    }

    const response = await axios({
        method: 'GET',
        url: parsedUrl.toString(),
        responseType: 'stream',
        maxRedirects: 5,
        timeout: 30000,
        validateStatus: (status) => status >= 200 && status < 400
    });

    const contentLength = parseInt(response.headers['content-length'] || '0', 10);
    if (contentLength > MAX_DOWNLOAD_SIZE) {
        response.data.destroy();
        throw new Error('Video is too large. Maximum size is 200MB.');
    }

    const extension = normalizeFileExtension(
        parsedUrl.pathname,
        response.headers['content-type'],
        VIDEO_EXTENSIONS,
        ''
    );

    if (!extension) {
        response.data.destroy();
        throw new Error('Paste a direct video file URL or upload a file instead.');
    }

    const fileName = buildFilename('rap', extension);
    const destination = path.join(VIDEOS_DIR, fileName);
    const writeStream = fs.createWriteStream(destination);
    let downloadedBytes = 0;
    response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > MAX_DOWNLOAD_SIZE) {
            response.data.destroy();
            writeStream.destroy();
            safeUnlink(destination);
        }
    });
    try {
        await pipeline(response.data, writeStream);
    } catch {
        safeUnlink(destination);
        throw new Error('Download failed or exceeded the 200MB limit.');
    }

    if (!fs.existsSync(destination) || fs.statSync(destination).size < 1024) {
        safeUnlink(destination);
        throw new Error('The downloaded video was empty or invalid.');
    }

    return {
        filename: fileName,
        video: normalizeMediaPath(`/VIDEOS/${fileName}`)
    };
}

function moveUploadedVideo(file) {
    const extension = normalizeFileExtension(file.originalname, file.mimetype, VIDEO_EXTENSIONS, '.mp4');
    const fileName = buildFilename('rap', extension);
    const destination = path.join(VIDEOS_DIR, fileName);
    fs.renameSync(file.path, destination);

    return {
        filename: fileName,
        video: normalizeMediaPath(`/VIDEOS/${fileName}`)
    };
}

function buildApp(options = {}) {
    ensureDirectories();

    const store = options.store || new JsonStore(ROOT_DIR);
    store.setNotificationCallback((username, notification) => {
        const io = app.get('io');
        if (io) io.to(`user:${username}`).emit('notification', notification);
    });
    const app = express();
    app._store = store;

    const rateLimitBuckets = new Map();
    function rateLimit(maxReq, windowMs, banMs) {
        return function rl(req, res, next) {
            const ip = req.ip || req.connection.remoteAddress || 'unknown';
            const now = Date.now();
            if (!rateLimitBuckets.has(ip)) {
                rateLimitBuckets.set(ip, { hits: [], banUntil: 0 });
            }
            const bucket = rateLimitBuckets.get(ip);
            if (bucket.banUntil > now) {
                return res.status(429).json({ success: false, message: 'Too many requests. Slow down.' });
            }
            bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
            if (bucket.hits.length >= maxReq) {
                bucket.banUntil = now + banMs;
                bucket.hits = [];
                return res.status(429).json({ success: false, message: 'Too many requests. Slow down.' });
            }
            bucket.hits.push(now);
            next();
        };
    }
    // Path-specific rate limits: auth strict, upload strict, interact moderate, general loose
    app.use('/api/auth', rateLimit(10, 10000, 30000));
    app.use('/api/finalize', rateLimit(10, 10000, 30000));
    app.use('/api/import', rateLimit(10, 10000, 30000));
    app.use('/api', rateLimit(100, 10000, 15000));

    const upload = multer({
        dest: UPLOADS_DIR,
        limits: {
            fileSize: 200 * 1024 * 1024
        }
    });

    app.use(express.json({ limit: '2mb' }));
    app.use(express.urlencoded({ extended: true, limit: '2mb' }));

    app.use('/VIDEOS', express.static(VIDEOS_DIR));
    app.use('/uploads', express.static(UPLOADS_DIR));
    app.use('/PICTURES', express.static(PICTURES_DIR));
    app.use('/assets', express.static(PUBLIC_DIR));

    if (fs.existsSync(WELL_KNOWN_DIR)) {
        app.use('/.well-known', express.static(WELL_KNOWN_DIR));
    }

    app.get('/api/health', (req, res) => {
        res.json({
            ok: true,
            storage: 'json',
            now: new Date().toISOString()
        });
    });

    app.post('/api/auth', async (req, res) => {
        const action = String(req.body?.action || '').trim().toLowerCase();
        const username = normalizeUsername(req.body?.username);
        const password = String(req.body?.password || '');

        const usernameError = validateUsername(username);
        if (usernameError) {
            return res.status(400).json({ success: false, message: usernameError });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ success: false, message: passwordError });
        }

        const existingUser = store.getUser(username);

        if (action === 'register') {
            if (existingUser) {
                return res.status(409).json({ success: false, message: 'Username taken.' });
            }

            const passwordHash = await hashPassword(password);
            const createdUser = store.createUser(username, passwordHash);
            const token = createAuthToken(createdUser.username, AUTH_SECRET);
            return res.json({ success: true, token, user: { username: createdUser.username } });
        }

        if (action !== 'login') {
            return res.status(400).json({ success: false, message: 'Unsupported auth action.' });
        }

        if (!existingUser || !(await verifyPassword(password, existingUser.password))) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        const token = createAuthToken(existingUser.username, AUTH_SECRET);
        return res.json({ success: true, token, user: { username: existingUser.username } });
    });

    app.get('/api/feed', (req, res) => {
        const viewer = normalizeUsername(req.query.user);
        const limit = parseInt(req.query.limit, 10) || 20;
        const offset = parseInt(req.query.offset, 10) || 0;
        res.json(store.listFeed(viewer, { limit, offset }));
    });

    app.get('/api/momentum', (req, res) => {
        const username = normalizeUsername(req.query.user);
        res.json({ momentum: store.computeMomentum(username) });
    });

    app.get('/api/feed/recommended', (req, res) => {
        const viewer = normalizeUsername(req.query.user);
        const limit = parseInt(req.query.limit, 10) || 20;
        const offset = parseInt(req.query.offset, 10) || 0;
        res.json(store.listRecommended(viewer, { limit, offset }));
    });

    app.get('/api/chart', (req, res) => {
        const mode = req.query.mode || 'daily';
        const genre = req.query.genre || 'ALL CITY';
        res.json(store.getChart(mode, genre));
    });

    app.get('/api/challenge', (req, res) => {
        const tag = req.query.tag;
        if (!tag) return res.json([]);
        res.json(store.getChallengeVideos(tag));
    });

    app.get('/api/achievements', requireAuth, (req, res) => {
        const achievements = store.getAchievements(req.authUser);
        const user = store.getUser(req.authUser);
        res.json({ achievements, streak: user?.streak || 0, longest_streak: user?.longest_streak || 0 });
    });

    app.get('/api/feed/trending', (req, res) => {
        const limit = parseInt(req.query.limit, 10) || 10;
        res.json(store.getTrendingTags(limit));
    });

    app.get('/api/radio', (req, res) => {
        const genre = req.query.genre || '';
        const exclude = req.query.exclude ? String(req.query.exclude).split(',').filter(Boolean) : [];
        const limit = parseInt(req.query.limit, 10) || 30;
        res.json(store.getRadioFeed(genre, exclude, limit));
    });

    app.get('/artist/:username', (req, res) => {
        const data = store.getPublicFeed(req.params.username);
        if (!data.success) return res.status(404).send('Artist not found');
        const avatar = data.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=000&color=fff`;
        const videosHtml = data.videos.map((v) => `
            <div style="aspect-ratio:9/16;background:#111;border-radius:12px;overflow:hidden;position:relative">
                <video src="${normalizeMediaPath(v.video)}" muted style="width:100%;height:100%;object-fit:cover"></video>
                <div style="position:absolute;bottom:0;left:0;right:0;padding:8px;background:linear-gradient(transparent,rgba(0,0,0,0.9))">
                    <p style="margin:0;font-size:11px;font-weight:700;color:white">${String(v.bio || '').slice(0, 60)}</p>
                </div>
            </div>
        `).join('');
        const linksHtml = Array.isArray(data.links) ? data.links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener" style="color:#888;text-decoration:none;font-size:12px;margin:0 8px">${l.platform}</a>`).join('') : '';
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>@${data.username} on RapR — Underground Rap Artist</title><meta name="description" content="${data.bio} — Check out drops from ${data.username} on RapR, the underground rap platform."><meta property="og:title" content="@${data.username} on RapR"><meta property="og:description" content="${data.bio || 'Underground rap artist on RapR'}"><meta property="og:image" content="${avatar}"><meta property="og:url" content="https://rap.genznewz.com/artist/${encodeURIComponent(data.username)}"><meta name="twitter:card" content="summary"><link rel="canonical" href="https://rap.genznewz.com/artist/${encodeURIComponent(data.username)}"><style>body{background:#0a0a0a;color:white;font-family:system-ui,sans-serif;margin:0;padding:0}img,video{max-width:100%}a{color:#ef4444}</style></head><body style="max-width:800px;margin:0 auto;padding:24px"><div style="text-align:center;padding:40px 0"><img src="${avatar}" style="width:96px;height:96px;border-radius:50%;border:3px solid #ef4444" alt="${data.username}"><h1 style="font-size:32px;font-weight:900;margin:12px 0 4px">@${data.username}</h1><p style="color:#888;font-size:14px;margin:0 0 16px">${data.bio || 'Underground rap artist'}</p><div style="margin-bottom:16px">${linksHtml}</div><div style="color:#555;font-size:12px;margin-bottom:24px"><span style="font-weight:700;color:white">${data.total_drops}</span> drops</div><a href="https://rap.genznewz.com/?ref=artist" style="display:inline-block;background:#ef4444;color:white;padding:12px 32px;border-radius:50px;text-decoration:none;font-weight:700;font-size:13px">Follow on RapR</a></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:24px">${videosHtml}</div><footer style="text-align:center;padding:40px 0;color:#333;font-size:11px"><p>RapR — The Underground Rap Platform</p></footer></body></html>`);
    });

    app.get('/api/profile', (req, res) => {
        const target = normalizeUsername(req.query.user);
        const viewer = getAuthenticatedUsername(req) || normalizeUsername(req.query.viewer);
        res.json(store.getProfile(target, viewer));
    });

    app.get('/api/admin/reports', requireAuth, (req, res) => {
        const admins = ['rapradmin', (process.env.ADMIN_USERS || '').split(',').map((s) => s.trim()).filter(Boolean)];
        if (!admins.includes(req.authUser)) return res.status(403).json({ success: false, message: 'Not authorized.' });
        const social = store.readSocial();
        const videoIds = social.reports.map((r) => r.videoId);
        const videos = store.listFeed();
        const reported = social.reports.map((r) => ({
            ...r,
            video: videos.find((v) => v.id === r.videoId) || null
        }));
        res.json(reported);
    });

    app.get('/api/video/analytics', requireAuth, (req, res) => {
        const id = req.query.id;
        if (!id) return res.status(400).json({ success: false, message: 'Video ID required.' });
        res.json(store.getVideoAnalytics(id, req.authUser) || { success: false, message: 'Not found.' });
    });

    app.get('/api/profile/analytics', requireAuth, (req, res) => {
        const target = normalizeUsername(req.query.user);
        if (req.authUser !== target) {
            return res.status(403).json({ success: false, message: 'You can only view your own analytics.' });
        }
        res.json(store.getProfileAnalytics(target));
    });

    app.post(
        '/api/profile/update',
        requireAuth,
        upload.fields([
            { name: 'avatar_file', maxCount: 1 },
            { name: 'header_file', maxCount: 1 }
        ]),
        (req, res) => {
            const currentUser = req.authUser;
            const updates = {};
            const requestedBio = String(req.body?.bio || '').trim();
            if (Object.prototype.hasOwnProperty.call(req.body || {}, 'bio')) {
                updates.bio = requestedBio.slice(0, 280);
            }

            if (req.files?.avatar_file?.[0]) {
                const avatarFile = req.files.avatar_file[0];
                const extension = normalizeFileExtension(
                    avatarFile.originalname,
                    avatarFile.mimetype,
                    IMAGE_EXTENSIONS,
                    '.jpg'
                );
                const avatarName = buildFilename('avatar', extension);
                const destination = path.join(UPLOADS_DIR, avatarName);
                fs.renameSync(avatarFile.path, destination);
                updates.avatar = normalizeMediaPath(`/uploads/${avatarName}`);
            }

            if (req.files?.header_file?.[0]) {
                const headerFile = req.files.header_file[0];
                const extension = normalizeFileExtension(
                    headerFile.originalname,
                    headerFile.mimetype,
                    IMAGE_EXTENSIONS,
                    '.jpg'
                );
                const headerName = buildFilename('header', extension);
                const destination = path.join(UPLOADS_DIR, headerName);
                fs.renameSync(headerFile.path, destination);
                updates.header = normalizeMediaPath(`/uploads/${headerName}`);
            }

            const rawLinks = req.body?.links;
            if (rawLinks) {
                let parsedLinks;
                try { parsedLinks = typeof rawLinks === 'string' ? JSON.parse(rawLinks) : rawLinks; } catch { parsedLinks = null; }
                if (Array.isArray(parsedLinks)) {
                    updates.links = parsedLinks.slice(0, 5).map((l) => ({
                        platform: String(l.platform || '').trim().slice(0, 20),
                        url: String(l.url || '').trim().slice(0, 500)
                    })).filter((l) => l.platform && l.url && /^https?:\/\//i.test(l.url));
                }
            }

            const updatedUser = store.updateUserProfile(currentUser, updates);
            return res.json({ success: Boolean(updatedUser), data: updatedUser });
        }
    );

    app.post('/api/import', requireAuth, async (req, res) => {
        const videoUrl = String(req.body?.videoUrl || req.body?.instaUrl || '').trim();
        if (!videoUrl) {
            return res.status(400).json({ success: false, message: 'Paste a direct video URL.' });
        }

        try {
            const imported = await downloadVideoFromUrl(videoUrl);
            return res.json({ success: true, ...imported });
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
    });

    app.get('/api/drafts', requireAuth, (req, res) => {
        res.json(store.getDrafts(req.authUser));
    });

    app.post('/api/drafts/save', requireAuth, (req, res) => {
        res.json(store.saveDraft(req.authUser, req.body || {}));
    });

    app.post('/api/beats/upload', requireAuth, upload.single('audio_file'), (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'No audio file provided.' });
        const extension = path.extname(req.file.originalname || '.mp3').toLowerCase();
        const allowedAudio = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a']);
        if (!allowedAudio.has(extension)) { safeUnlink(req.file.path); return res.status(400).json({ success: false, message: 'Unsupported audio format.' }); }
        const fileName = `beat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${extension}`;
        const dest = path.join(BEATS_DIR, fileName);
        fs.renameSync(req.file.path, dest);
        const result = store.uploadBeat({ username: req.authUser, title: req.body?.title, bpm: req.body?.bpm, genre: req.body?.genre, filePath: `/BEATS/${fileName}`, duration: req.body?.duration });
        return res.json(result);
    });

    app.get('/api/beats', (req, res) => {
        const viewer = getAuthenticatedUsername(req);
        res.json(store.listBeats({ genre: req.query.genre, bpmMin: req.query.bpmMin, bpmMax: req.query.bpmMax, sort: req.query.sort }));
    });

    app.use('/BEATS', express.static(BEATS_DIR));

    app.delete('/api/drafts/:id', requireAuth, (req, res) => {
        res.json(store.deleteDraft(req.params.id, req.authUser));
    });

    app.post('/api/finalize', requireAuth, upload.single('video_file'), (req, res) => {
        const bio = String(req.body?.bio || '').trim();
        const tags = normalizeTags(req.body?.tags);
        const song_title = String(req.body?.song_title || '').trim();
        const producer = String(req.body?.producer || '').trim();
        const lyrics = String(req.body?.lyrics || '').trim();
        const duet_of = String(req.body?.duet_of || '').trim();
        const video_filter = String(req.body?.video_filter || '').trim();
        const visibility = req.body?.visibility === 'vault' ? 'vault' : 'public';
        let collaborators = [];
        if (req.body?.collaborators) {
            try { collaborators = typeof req.body.collaborators === 'string' ? JSON.parse(req.body.collaborators) : req.body.collaborators; } catch {}
        }

        let finalizedVideo = null;
        try {
            if (req.file) {
                finalizedVideo = moveUploadedVideo(req.file);
            } else {
                const filename = path.basename(String(req.body?.filename || '').trim());
                if (!filename) {
                    return res.status(400).json({ success: false, message: 'No video file provided.' });
                }

                const absolutePath = path.join(VIDEOS_DIR, filename);
                if (!fs.existsSync(absolutePath)) {
                    return res.status(404).json({ success: false, message: 'Imported video file not found.' });
                }

                finalizedVideo = {
                    filename,
                    video: normalizeMediaPath(`/VIDEOS/${filename}`)
                };
            }

            const result = store.addVideo({
                username: req.authUser,
                bio: bio || 'New Drop',
                tags,
                mediaPath: finalizedVideo.video,
                song_title,
                producer,
                lyrics,
                duet_of,
                video_filter,
                visibility,
                collaborators
            });

            return res.json(result);
        } catch (error) {
            if (req.file?.path) {
                safeUnlink(req.file.path);
            }
            return res.status(400).json({ success: false, message: error.message || 'Could not publish this drop.' });
        }
    });

    app.all('/api/interact', requireAuth, (req, res) => {
        const action = String(req.body?.action || req.query.action || '').trim();
        const currentUser = req.authUser;
        const body = req.body || {};

        if (action === 'like') {
            return res.json(store.likeVideo(currentUser, body.id || req.query.id));
        }

        if (action === 'save') {
            return res.json(store.toggleSave(currentUser, body.id || req.query.id));
        }

        if (action === 'comment') {
            return res.json(
                store.addComment(
                    currentUser,
                    body.id || req.query.id,
                    body.text || req.query.text,
                    body.parent_id || req.query.parent_id || null
                )
            );
        }

        if (action === 'get_comments') {
            return res.json(store.listComments(req.query.video_id || body.video_id, currentUser));
        }

        if (action === 'like_comment') {
            return res.json(store.likeComment(currentUser, body.comment_id || req.query.comment_id));
        }

        if (action === 'follow') {
            return res.json(store.toggleFollow(currentUser, body.target_username || req.query.target));
        }

        if (action === 'shoutout') {
            const target = body.target_username || req.query.target;
            const canonical = store.findCanonicalUsername(target);
            if (!canonical) return res.json({ success: false, message: 'User not found.' });
            store.createNotification(canonical, currentUser, 'shoutout', 'gave you a shoutout!');
            return res.json({ success: true });
        }

        if (action === 'invite_collab') {
            const target = body.target_username || req.query.target;
            const canonical = store.findCanonicalUsername(target);
            if (!canonical) return res.json({ success: false, message: 'User not found.' });
            store.createNotification(canonical, currentUser, 'collab', 'wants to collab on a drop!');
            return res.json({ success: true });
        }

        if (action === 'send_message') {
            return res.json(store.sendMessage(currentUser, body.receiver || req.query.receiver, body.text || ''));
        }

        if (action === 'get_chats') {
            return res.json(store.listChats(currentUser));
        }

        if (action === 'get_messages') {
            return res.json(store.listMessages(currentUser, req.query.other || body.other));
        }

        if (action === 'get_notifications') {
            return res.json(store.listNotifications(currentUser));
        }

        if (action === 'search_users') {
            return res.json(store.searchUsers(req.query.query || body.query));
        }

        if (action === 'get_followers') {
            return res.json(store.listFollowers(req.query.target || body.target));
        }

        if (action === 'get_following') {
            return res.json(store.listFollowing(req.query.target || body.target));
        }

        if (action === 'view') {
            return res.json(store.recordView(currentUser, body.id || req.query.id));
        }

        if (action === 'update_links') {
            const links = Array.isArray(body.links) ? body.links.slice(0, 5) : [];
            const sanitized = links.map((l) => ({
                platform: String(l.platform || '').trim().slice(0, 20),
                url: String(l.url || '').trim().slice(0, 500)
            })).filter((l) => l.platform && l.url && /^https?:\/\//i.test(l.url));
            const updated = store.updateUserProfile(currentUser, { links: sanitized });
            return res.json({ success: true, links: sanitized });
        }

        if (action === 'report') {
            return res.json(store.reportVideo(currentUser, body.id || req.query.id, body.reason || req.query.reason));
        }

        if (action === 'block') {
            return res.json(store.blockUser(currentUser, body.target_username || req.query.target));
        }

        if (action === 'unblock') {
            return res.json(store.unblockUser(currentUser, body.target_username || req.query.target));
        }

        if (action === 'admin_verify_user') {
            const admins = ['rapradmin', (process.env.ADMIN_USERS || '').split(',').map((s) => s.trim()).filter(Boolean)];
            if (!admins.includes(currentUser)) return res.status(403).json({ success: false, message: 'Not authorized.' });
            const target = body.target_username || req.query.target;
            store.updateUserProfile(target, { verified: true, verification_status: 'approved' });
            store.createNotification(target, currentUser, 'verify', 'Your account has been verified!');
            return res.json({ success: true });
        }

        if (action === 'request_beat') {
            return res.json(store.requestBeat(currentUser, body.beat_id || req.query.beat_id, body.message || req.query.message));
        }

        if (action === 'approve_beat') {
            return res.json(store.approveBeatRequest(currentUser, body.beat_id || req.query.beat_id, body.rapper || req.query.rapper));
        }

        if (action === 'create_challenge') {
            return res.json(store.createChallenge({ title: body.title, created_by: currentUser, genre_tag: body.genre_tag, deadline: body.deadline, prize: body.prize }));
        }

        if (action === 'list_challenges') {
            return res.json(store.listChallenges(body.status || req.query.status));
        }

        if (action === 'join_challenge') {
            return res.json(store.joinChallenge(body.challenge_id || req.query.challenge_id, body.video_id || req.query.video_id, currentUser));
        }

        if (action === 'get_pending_requests') {
            return res.json(store.getPendingRequests(currentUser));
        }

        if (action === 'request_verification') {
            const result = store.updateUserProfile(currentUser, { verification_requested: true, verification_status: 'pending' });
            return res.json({ success: true });
        }

        if (action === 'get_blocked') {
            return res.json(store.getBlockedUsers(currentUser));
        }

        if (action === 'add_muted_word') {
            return res.json(store.addMutedWord(currentUser, body.word || req.query.word));
        }

        if (action === 'remove_muted_word') {
            return res.json(store.removeMutedWord(currentUser, body.word || req.query.word));
        }

        if (action === 'get_sound_videos') {
            const videoIds = store.getSoundVideos(body.sound_id || req.query.sound_id);
            const allVideos = store.listFeed(currentUser, { limit: 50 });
            const soundVideos = allVideos.filter((v) => videoIds.includes(v.id));
            return res.json(soundVideos);
        }

        if (action === 'get_views') {
            return res.json({ views: store.getViews(req.query.id || body.id) });
        }

        if (action === 'delete_comment') {
            return res.json(store.deleteComment(currentUser, body.comment_id || req.query.comment_id));
        }

        if (action === 'admin_remove_video') {
            const admins = ['rapradmin', (process.env.ADMIN_USERS || '').split(',').map((s) => s.trim()).filter(Boolean)];
            if (!admins.includes(currentUser)) return res.status(403).json({ success: false, message: 'Not authorized.' });
            const result = store.deleteVideo(body.id || req.query.id, currentUser);
            if (result.success && result.absolutePath?.startsWith(VIDEOS_DIR)) safeUnlink(result.absolutePath);
            return res.json({ success: result.success });
        }

        if (action === 'delete_video') {
            const result = store.deleteVideo(body.id || req.query.id, currentUser);
            if (result.success && result.absolutePath?.startsWith(VIDEOS_DIR)) {
                safeUnlink(result.absolutePath);
            }
            return res.json({ success: result.success, message: result.message || '' });
        }

        if (action === 'become_fan') {
            return res.json(store.becomeFan(currentUser, body.target_username || req.query.target));
        }

        if (action === 'update_collab_profile') {
            return res.json(store.updateCollabProfile(currentUser, body.collab_profile || {}));
        }

        if (action === 'find_collab_partners') {
            return res.json(store.findCollabPartners(currentUser, parseInt(body.limit, 10) || 20));
        }

        if (action === 'create_scene') {
            return res.json(store.createScene({ name: body.name, description: body.description, created_by: currentUser, tags: body.tags }));
        }

        if (action === 'join_scene') {
            return res.json(store.joinScene(body.scene_id || req.query.scene_id, currentUser));
        }

        if (action === 'list_scenes') {
            return res.json(store.listScenes());
        }

        if (action === 'get_scene_feed') {
            return res.json(store.getSceneFeed(body.scene_id || req.query.scene_id));
        }

        if (action === 'become_mentor') {
            const u = store.updateUserProfile(currentUser, { mentor: true });
            return res.json({ success: true });
        }

        if (action === 'request_mentor') {
            const target = body.target_username || req.query.target;
            const canonical = store.findCanonicalUsername(target);
            if (!canonical) return res.json({ success: false, message: 'User not found.' });
            store.createNotification(canonical, currentUser, 'mentor_request', 'wants you as a mentor');
            return res.json({ success: true });
        }

        if (action === 'get_mentors') {
            const users = store.readUsers();
            const result = Object.entries(users).filter(([, d]) => d.mentor).map(([name]) => ({ username: name }));
            return res.json(result);
        }

        if (action === 'get_pending_requests') {
            return res.json(store.getPendingRequests(currentUser));
        }

        // --- BATTLES ---
        if (action === 'create_battle') {
            return res.json(store.createBattle({ artist1: currentUser, artist2: body.artist2, beat_id: body.beat_id, deadline: body.deadline }));
        }
        if (action === 'list_battles') {
            return res.json(store.listBattles(body.status || req.query.status));
        }
        if (action === 'join_battle') {
            return res.json(store.joinBattle(body.battle_id || req.query.battle_id, currentUser, body.video_url || req.query.video_url));
        }
        if (action === 'cast_vote') {
            return res.json(store.castBattleVote(currentUser, body.battle_id || req.query.battle_id, body.entry_username || req.query.entry_username));
        }
        if (action === 'close_battle') {
            return res.json(store.closeBattle(body.battle_id || req.query.battle_id));
        }

        // --- FEEDBACK ---
        if (action === 'request_feedback') {
            return res.json(store.requestFeedback(body.video_id || req.query.video_id, currentUser));
        }
        if (action === 'submit_feedback') {
            return res.json(store.submitFeedback(body.feedback_id || req.query.feedback_id, currentUser, body.what_worked, body.what_improve));
        }
        if (action === 'get_feedback') {
            return res.json(store.getFeedbackForVideo(req.query.video_id || body.video_id));
        }
        if (action === 'get_pending_feedback') {
            return res.json(store.getPendingFeedback(currentUser));
        }
        if (action === 'vote_helpful') {
            return res.json(store.voteHelpful(body.feedback_id || req.query.feedback_id, currentUser));
        }

        // --- CONNECT ---
        if (action === 'get_connects') {
            return res.json(store.getConnects(currentUser));
        }

        return res.status(400).json({ success: false, message: 'Unsupported interaction.' });
    });

    app.get('/', (req, res) => {
        res.sendFile(INDEX_FILE);
    });

    app.get('/index.html', (req, res) => {
        res.sendFile(INDEX_FILE);
    });

    app.get('/robots.txt', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'robots.txt'));
    });

    app.get('/sitemap.xml', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'sitemap.xml'));
    });

    app.use((err, req, res, next) => {
        if (req.file?.path) {
            safeUnlink(req.file.path);
        }

        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, message: 'Uploaded files are too large.' });
        }

        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Server error.' });
        }

        return next();
    });

    return app;
}

function startServer() {
    const app = buildApp();
    const httpServer = createServer(app);
    const io = new Server(httpServer, { cors: { origin: '*' } });
    app.set('io', io);

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('No token'));
        const username = verifyAuthToken(token, AUTH_SECRET);
        if (!username) return next(new Error('Invalid token'));
        socket.username = username;
        next();
    });

    io.on('connection', (socket) => {
        socket.join(`user:${socket.username}`);
        socket.on('disconnect', () => {});
    });

    // Store notification events pass through io
    app._notifyClients = (username, notification) => {
        io.to(`user:${username}`).emit('notification', notification);
    };
    app._notifyChat = (username, message) => {
        io.to(`user:${username}`).emit('message', message);
    };

    // Publish scheduled drafts every 30 seconds
    const store = app._store;
    setInterval(() => {
        if (store && typeof store.publishScheduledDrafts === 'function') {
            store.publishScheduledDrafts();
        }
    }, 30000);

    return httpServer.listen(PORT, HOST, () => {
        console.log(`RapR server running on http://${HOST}:${PORT}`);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = {
    buildApp,
    startServer
};
