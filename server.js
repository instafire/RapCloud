require('dotenv').config({ quiet: true });

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

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
const WELL_KNOWN_DIR = path.join(ROOT_DIR, '.well-known');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3001);
const AUTH_SECRET = process.env.AUTH_SECRET || 'development-secret-change-me';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.ogg']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function ensureDirectories() {
    [VIDEOS_DIR, UPLOADS_DIR, PICTURES_DIR].forEach((dirPath) => {
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
    await pipeline(response.data, fs.createWriteStream(destination));

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
    const app = express();

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
        res.json(store.listFeed(viewer));
    });

    app.get('/api/profile', (req, res) => {
        const target = normalizeUsername(req.query.user);
        const viewer = getAuthenticatedUsername(req) || normalizeUsername(req.query.viewer);
        res.json(store.getProfile(target, viewer));
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

    app.post('/api/finalize', requireAuth, upload.single('video_file'), (req, res) => {
        const bio = String(req.body?.bio || '').trim();
        const tags = normalizeTags(req.body?.tags);

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
                mediaPath: finalizedVideo.video
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

        if (action === 'delete_video') {
            const result = store.deleteVideo(body.id || req.query.id, currentUser);
            if (result.success && result.absolutePath?.startsWith(VIDEOS_DIR)) {
                safeUnlink(result.absolutePath);
            }
            return res.json({ success: result.success, message: result.message || '' });
        }

        return res.status(400).json({ success: false, message: 'Unsupported interaction.' });
    });

    app.get('/', (req, res) => {
        res.sendFile(INDEX_FILE);
    });

    app.get('/index.html', (req, res) => {
        res.sendFile(INDEX_FILE);
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
    return app.listen(PORT, HOST, () => {
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
