const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

function readJson(filePath, fallbackValue) {
    if (!fs.existsSync(filePath)) {
        return fallbackValue;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallbackValue;
    }
}

function writeJson(filePath, value) {
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function normalizeTags(value) {
    if (Array.isArray(value)) {
        return value
            .map((tag) => String(tag || '').trim().replace(/^#/, '').toLowerCase())
            .filter(Boolean)
            .slice(0, 8);
    }

    if (typeof value === 'string' && value.trim()) {
        try {
            return normalizeTags(JSON.parse(value));
        } catch {
            return normalizeTags(value.split(/\s+/));
        }
    }

    return ['rap'];
}

function avatarForUser(username, avatarPath) {
    if (avatarPath) {
        return avatarPath;
    }

    return `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=000&color=fff`;
}

function normalizeMediaPath(value) {
    const mediaPath = String(value || '').replace(/\\/g, '/');

    if (!mediaPath) {
        return '';
    }

    if (/^https?:\/\//i.test(mediaPath)) {
        return mediaPath;
    }

    return mediaPath.startsWith('/') ? mediaPath : `/${mediaPath}`;
}

function toAbsoluteAssetPath(rootDir, assetPath) {
    if (!assetPath || /^https?:\/\//i.test(assetPath)) {
        return null;
    }

    const normalized = assetPath.replace(/^\/+/, '').replace(/\//g, path.sep);
    return path.resolve(rootDir, normalized);
}

function normalizeComment(comment) {
    const normalized = {
        id: String(comment.id || createId('cmt')),
        username: String(comment.username || 'Unknown'),
        text: String(comment.text || '').trim(),
        parent_id: comment.parent_id ? String(comment.parent_id) : null,
        likes: Number(comment.likes || comment.likes_count || 0),
        timestamp: comment.timestamp || comment.created_at || Date.now()
    };

    return normalized;
}

function normalizeVideo(video) {
    const comments = Array.isArray(video.comments) ? video.comments.map(normalizeComment) : [];

    return {
        id: String(video.id || createId('vid')),
        username: String(video.username || 'Unknown'),
        verified: video.verified !== false,
        bio: String(video.bio || video.description || 'New Drop').trim(),
        video: normalizeMediaPath(video.video || video.video_url || ''),
        tags: normalizeTags(video.tags),
        likes: Number(video.likes || video.likes_count || 0),
        comments,
        duet_of: String(video.duet_of || ''),
        video_filter: String(video.video_filter || 'none'),
        visibility: video.visibility || 'public',
        mentions: Array.isArray(video.mentions) ? video.mentions : [],
        collaborators: Array.isArray(video.collaborators) ? video.collaborators : [],
        song_title: String(video.song_title || '').trim(),
        producer: String(video.producer || '').trim(),
        original_sound_id: String(video.original_sound_id || ''),
        lyrics: String(video.lyrics || '').trim(),
        timestamp: video.timestamp || video.created_at || Date.now()
    };
}

function sortByNewest(a, b) {
    return Number(b.timestamp || 0) - Number(a.timestamp || 0);
}

class JsonStore {
    constructor(rootDir) {
        this.rootDir = rootDir;
        this.files = {
            users: path.join(rootDir, 'users.json'),
            videos: path.join(rootDir, 'database.json'),
            social: path.join(rootDir, 'social.json'),
            messages: path.join(rootDir, 'messages.json'),
            notifications: path.join(rootDir, 'notifications.json'),
            drafts: path.join(rootDir, 'drafts.json'),
            beats: path.join(rootDir, 'beats.json'),
            challenges: path.join(rootDir, 'challenges.json'),
            scenes: path.join(rootDir, 'scenes.json'),
            battles: path.join(rootDir, 'battles.json'),
            feedback: path.join(rootDir, 'feedback.json')
        };

        this.ensureFiles();
        this.ensureIntegrity();
    }

    ensureFiles() {
        const defaults = {
            users: {},
            videos: [],
            social: {
                follows: [],
                saves: [],
                videoLikes: [],
                commentLikes: [],
                videoViews: [],
                reports: [],
                blocks: []
            },
            messages: [],
            notifications: [],
            drafts: [],
            beats: [],
            challenges: [],
            scenes: [],
            battles: [],
            feedback: []
        };

        Object.entries(this.files).forEach(([key, filePath]) => {
            if (!fs.existsSync(filePath)) {
                writeJson(filePath, defaults[key]);
            }
        });
    }

    ensureIntegrity() {
        const users = this.readUsers();
        const videos = this.readVideos(true);
        const social = this.readSocial();
        const messages = this.readMessages();
        const notifications = this.readNotifications();

        writeJson(this.files.users, users);
        writeJson(this.files.videos, videos);
        writeJson(this.files.social, social);
        writeJson(this.files.messages, messages);
        writeJson(this.files.notifications, notifications);
    }

    readUsers() {
        const users = readJson(this.files.users, {});
        const normalized = {};

        Object.entries(users).forEach(([username, data]) => {
            normalized[username] = {
                password: data.password || data.password_hash || '',
                bio: String(data.bio || 'New Artist'),
                avatar: data.avatar ? normalizeMediaPath(data.avatar) : '',
                header: data.header ? normalizeMediaPath(data.header) : '',
                header_gradient: data.header_gradient || '',
                links: Array.isArray(data.links) ? data.links : [],
                mutedWords: Array.isArray(data.mutedWords) ? data.mutedWords : [],
                tip_link: data.tip_link || '',
                verification_requested: data.verification_requested || false,
                verification_status: data.verification_status || 'none',
                streak: Number(data.streak || 0),
                longest_streak: Number(data.longest_streak || 0),
                last_drop_date: data.last_drop_date || 0,
                achievements: Array.isArray(data.achievements) ? data.achievements : [],
                tier: data.tier || 'emerging',
                fanOf: Array.isArray(data.fanOf) ? data.fanOf : [],
                fans: Array.isArray(data.fans) ? data.fans : [],
                collab_profile: (typeof data.collab_profile === 'object' && data.collab_profile) ? data.collab_profile : { looking: false, role: 'vocalist', genres: [], availability: 'flexible', bio: '' },
                mentor: data.mentor || false,
                mentees: Array.isArray(data.mentees) ? data.mentees : [],
                created_at: data.created_at || Date.now()
            };
        });

        return normalized;
    }

    writeUsers(users) {
        writeJson(this.files.users, users);
    }

    writeVideos(videos) {
        writeJson(this.files.videos, videos);
    }

    writeSocial(social) {
        writeJson(this.files.social, social);
    }

    writeMessages(messages) {
        writeJson(this.files.messages, messages);
    }

    writeNotifications(notifications) {
        writeJson(this.files.notifications, notifications);
    }

    readVideos(skipSort = false) {
        const videos = readJson(this.files.videos, []);
        const normalized = Array.isArray(videos) ? videos.map(normalizeVideo) : [];
        return skipSort ? normalized : normalized.sort(sortByNewest);
    }

    writeVideos(videos) {
        writeJson(this.files.videos, videos);
    }

    readSocial() {
        const social = readJson(this.files.social, {});
        return {
            follows: Array.isArray(social.follows) ? social.follows : [],
            saves: Array.isArray(social.saves) ? social.saves : [],
            videoLikes: Array.isArray(social.videoLikes) ? social.videoLikes : [],
            commentLikes: Array.isArray(social.commentLikes) ? social.commentLikes : [],
            videoViews: Array.isArray(social.videoViews) ? social.videoViews : [],
            reports: Array.isArray(social.reports) ? social.reports : [],
            blocks: Array.isArray(social.blocks) ? social.blocks : []
        };
    }

    writeSocial(social) {
        writeJson(this.files.social, social);
    }

    readMessages() {
        const messages = readJson(this.files.messages, []);
        return Array.isArray(messages)
            ? messages.map((message) => ({
                id: String(message.id || createId('msg')),
                sender: String(message.sender || ''),
                receiver: String(message.receiver || ''),
                text: String(message.text || '').trim(),
                created_at: message.created_at || new Date().toISOString()
            }))
            : [];
    }

    writeMessages(messages) {
        writeJson(this.files.messages, messages);
    }

    readNotifications() {
        const notifications = readJson(this.files.notifications, []);
        return Array.isArray(notifications)
            ? notifications.map((notification) => ({
                id: String(notification.id || createId('ntf')),
                user_to: String(notification.user_to || ''),
                user_from: String(notification.user_from || ''),
                type: String(notification.type || 'bell'),
                message: String(notification.message || ''),
                related_id: notification.related_id ? String(notification.related_id) : null,
                is_read: Number(notification.is_read || 0),
                created_at: notification.created_at || new Date().toISOString()
            }))
            : [];
    }

    writeNotifications(notifications) {
        writeJson(this.files.notifications, notifications);
    }

    findCanonicalUsername(username) {
        const normalizedInput = String(username || '').trim().toLowerCase();
        if (!normalizedInput) {
            return null;
        }

        return Object.keys(this.readUsers()).find(
            (candidate) => candidate.toLowerCase() === normalizedInput
        ) || null;
    }

    getUser(username) {
        const canonical = this.findCanonicalUsername(username);
        if (!canonical) {
            return null;
        }

        const users = this.readUsers();
        return {
            username: canonical,
            ...users[canonical]
        };
    }

    createUser(username, passwordHash) {
        const users = this.readUsers();
        users[username] = {
            password: passwordHash,
            bio: 'New Artist',
            avatar: '',
            header: '',
            header_gradient: '',
            links: [],
            mutedWords: [],
            tip_link: '',
            verification_requested: false,
            verification_status: 'none',
            streak: 0,
            longest_streak: 0,
            last_drop_date: 0,
            achievements: [],
            tier: 'emerging',
            fanOf: [],
            fans: [],
            collab_profile: { looking: false, role: 'vocalist', genres: [], availability: 'flexible', bio: '' },
            mentor: false,
            mentees: [],
            created_at: Date.now()
        };
        writeJson(this.files.users, users);
        return this.getUser(username);
    }

    updateUserProfile(username, updates) {
        const canonical = this.findCanonicalUsername(username);
        if (!canonical) {
            return null;
        }

        const users = this.readUsers();
        users[canonical] = {
            ...users[canonical],
            ...updates
        };

        this.writeUsers(users);
        return this.getUser(canonical);
    }

    createNotification(userTo, userFrom, type, message, relatedId = null) {
        if (!userTo || !userFrom || userTo === userFrom) {
            return;
        }

        const notifications = this.readNotifications();
        const entry = {
            id: createId('ntf'),
            user_to: userTo,
            user_from: userFrom,
            type,
            message,
            related_id: relatedId ? String(relatedId) : null,
            is_read: 0,
            created_at: new Date().toISOString()
        };
        notifications.push(entry);
        this.writeNotifications(notifications);

        // Emit via callback if set
        if (this._onNotification) {
            this._onNotification(userTo, {
                ...entry,
                actor_name: userFrom,
                actor_avatar: avatarForUser(userFrom, this.readUsers()[userFrom]?.avatar)
            });
        }
    }

    setNotificationCallback(cb) {
        this._onNotification = cb;
    }

    listRecommended(viewerUsername, options = {}) {
        const viewer = this.findCanonicalUsername(viewerUsername);
        if (!viewer) return [];

        const users = this.readUsers();
        const videos = this.readVideos();
        const social = this.readSocial();
        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
        const offset = Math.max(Number(options.offset) || 0, 0);

        const followedUsers = new Set(
            social.follows.filter((e) => e.follower === viewer).map((e) => e.following)
        );

        const likedTagSet = new Set();
        const likedVideoIds = new Set(
            social.videoLikes.filter((e) => e.username === viewer).map((e) => e.videoId)
        );
        videos.forEach((v) => {
            if (likedVideoIds.has(v.id) && Array.isArray(v.tags)) {
                v.tags.forEach((t) => likedTagSet.add(t));
            }
        });

        const seen = new Set();
        const result = [];

        // Tier 1: followed users
        for (const v of videos) {
            if (followedUsers.has(v.username) && !seen.has(v.id)) {
                seen.add(v.id);
                result.push(v);
            }
        }

        // Tier 2: tag overlap with liked videos
        for (const v of videos) {
            if (seen.has(v.id)) continue;
            if (Array.isArray(v.tags) && v.tags.some((t) => likedTagSet.has(t))) {
                seen.add(v.id);
                result.push(v);
            }
        }

        // Tier 3: newest
        for (const v of videos) {
            if (seen.has(v.id)) continue;
            seen.add(v.id);
            result.push(v);
        }

        const sliced = result.slice(offset, offset + limit);
        return sliced.map((video) => {
            const owner = users[video.username] || {};
            const relationLikes = social.videoLikes.filter((entry) => String(entry.videoId) === video.id).length;
            const hasLiked = social.videoLikes.some((entry) => entry.username === viewer && String(entry.videoId) === video.id);
            const hasSaved = social.saves.some((entry) => entry.username === viewer && String(entry.videoId) === video.id);

            return {
                id: video.id,
                video: normalizeMediaPath(video.video),
                username: video.username,
                bio: video.bio || owner.bio || 'New Drop',
                avatar: avatarForUser(video.username, owner.avatar),
                header: owner.header || '',
                likes: video.likes + relationLikes,
                comments_count: video.comments.length,
                views_count: social.videoViews.filter((v) => String(v.videoId) === video.id).length,
                tags: normalizeTags(video.tags),
                comments: [],
                has_liked: hasLiked,
                has_saved: hasSaved,
                verified: video.verified !== false,
                timestamp: video.timestamp
            };
        });
    }

    getChart(mode, genre) {
        const videos = this.readVideos();
        const social = this.readSocial();
        let now = Date.now();
        let window;
        if (mode === 'weekly') window = 7 * 86400000;
        else if (mode === 'monthly') window = 30 * 86400000;
        else window = 86400000; // daily

        const since = now - window;
        const scored = [];

        videos.forEach((v) => {
            if (genre && genre !== 'ALL CITY') {
                const g = genre.toLowerCase();
                if (!v.tags.some((t) => t.toLowerCase().includes(g))) return;
            }
            const periodLikes = social.videoLikes.filter((e) => String(e.videoId) === v.id).length;
            const periodViews = social.videoViews.filter((e) => String(e.videoId) === v.id && e.timestamp >= since).length;
            const score = periodLikes * 2 + periodViews + Number(v.likes || 0);
            scored.push({ ...v, score, periodLikes, periodViews });
        });

        return scored.sort((a, b) => b.score - a.score).slice(0, 20);
    }

    getChallengeVideos(tag) {
        const cleaned = String(tag || '').trim().toLowerCase();
        if (!cleaned) return [];
        const videos = this.readVideos();
        return videos.filter((v) => v.tags.some((t) => t.toLowerCase() === cleaned));
    }

    getTrendingTags(limit = 10) {
        const videos = this.readVideos();
        const tagCount = new Map();
        videos.forEach((v) => {
            if (Array.isArray(v.tags)) {
                v.tags.forEach((t) => {
                    const key = t.toLowerCase().trim();
                    if (key) tagCount.set(key, (tagCount.get(key) || 0) + 1);
                });
            }
        });
        return Array.from(tagCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([tag, count]) => ({ tag, count }));
    }

    listFeed(viewerUsername, options = {}) {
        const users = this.readUsers();
        let videos = this.readVideos();
        const social = this.readSocial();
        const viewer = this.findCanonicalUsername(viewerUsername);
        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
        const offset = Math.max(Number(options.offset) || 0, 0);

        // Filter blocked users
        if (viewer) {
            const blocked = new Set(social.blocks.filter((b) => b.blocker === viewer).map((b) => b.blocked));
            if (blocked.size) videos = videos.filter((v) => !blocked.has(v.username));
        }

        // Filter muted content
        if (viewer && Array.isArray(users[viewer]?.mutedWords) && users[viewer].mutedWords.length) {
            const muted = users[viewer].mutedWords;
            videos = videos.filter((v) => {
                const text = (v.bio || '').toLowerCase();
                const tags = (v.tags || []).join(' ').toLowerCase();
                return !muted.some((w) => text.includes(w) || tags.includes(w));
            });
        }

        // Filter vault videos — only show to creator or their fans
        videos = videos.filter((v) => {
            if (v.visibility !== 'vault') return true;
            if (!viewer) return false;
            if (v.username === viewer) return true;
            return (users[viewer]?.fanOf || []).includes(v.username);
        });

        return videos.slice(offset, offset + limit).map((video) => {
            const owner = users[video.username] || {};
            const relationLikes = social.videoLikes.filter((entry) => String(entry.videoId) === video.id).length;
            const hasLiked = viewer
                ? social.videoLikes.some((entry) => entry.username === viewer && String(entry.videoId) === video.id)
                : false;
            const hasSaved = viewer
                ? social.saves.some((entry) => entry.username === viewer && String(entry.videoId) === video.id)
                : false;

            return {
                id: video.id,
                video: normalizeMediaPath(video.video),
                username: video.username,
                bio: video.bio || owner.bio || 'New Drop',
                avatar: avatarForUser(video.username, owner.avatar),
                header: owner.header || '',
                likes: video.likes + relationLikes,
                comments_count: video.comments.length,
                views_count: social.videoViews.filter((v) => String(v.videoId) === video.id).length,
                tags: normalizeTags(video.tags),
                comments: [],
                has_liked: hasLiked,
                has_saved: hasSaved,
                verified: video.verified !== false,
                mentions: video.mentions || [],
                duet_of: video.duet_of || '',
                video_filter: video.video_filter || 'none',
                visibility: video.visibility || 'public',
                collaborators: video.collaborators || [],
                song_title: video.song_title || '',
                producer: video.producer || '',
                original_sound_id: video.original_sound_id || '',
                lyrics: video.lyrics || '',
                timestamp: video.timestamp
            };
        });
    }

    getVideoAnalytics(videoId, username) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) return null;
        const videos = this.readVideos();
        const video = videos.find((v) => v.id === String(videoId) && v.username === owner);
        if (!video) return null;
        const social = this.readSocial();
        const views = social.videoViews.filter((v) => String(v.videoId) === video.id);
        const viewCount = views.length;
        const likeCount = Number(video.likes || 0) + social.videoLikes.filter((e) => String(e.videoId) === video.id).length;
        const saveCount = social.saves.filter((e) => String(e.videoId) === video.id).length;
        const commentCount = video.comments.length;

        // Views per day for last 7 days
        const sevenDaysAgo = Date.now() - 7 * 86400000;
        const viewsOverTime = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000);
            const key = d.toISOString().slice(0, 10);
            viewsOverTime[key] = 0;
        }
        views.forEach((v) => {
            const d = new Date(v.timestamp).toISOString().slice(0, 10);
            if (viewsOverTime[d] !== undefined) viewsOverTime[d]++;
        });

        return { viewCount, likeCount, saveCount, commentCount, viewsOverTime };
    }

    getProfileAnalytics(username) {
        const target = this.findCanonicalUsername(username);
        if (!target) {
            return { success: false, message: 'User not found.' };
        }

        const videos = this.readVideos();
        const social = this.readSocial();
        const userVideos = videos.filter((v) => v.username === target);

        const totalDrops = userVideos.length;
        let totalViews = 0;
        let totalLikes = 0;
        const userVideoIds = userVideos.map((v) => v.id);

        userVideoIds.forEach((vidId) => {
            totalViews += social.videoViews.filter((v) => String(v.videoId) === vidId).length;
        });

        userVideos.forEach((v) => {
            totalLikes += Number(v.likes || 0);
        });
        totalLikes += social.videoLikes.filter((entry) => userVideoIds.includes(String(entry.videoId))).length;

        const totalSaves = social.saves.filter((entry) => userVideoIds.includes(String(entry.videoId))).length;

        const followerCount = social.follows.filter((entry) => entry.following === target).length;
        const followerGrowth = followerCount;

        return {
            success: true,
            total_drops: totalDrops,
            total_views: totalViews,
            total_likes: totalLikes,
            total_saves: totalSaves,
            follower_count: followerCount,
            follower_growth: followerGrowth
        };
    }

    getProfile(targetUsername, viewerUsername) {
        const target = this.getUser(targetUsername);
        if (!target) {
            const fallbackName = String(targetUsername || 'Unknown');
            return {
                username: fallbackName,
                bio: 'User not found.',
                avatar: avatarForUser(fallbackName, ''),
                header: '',
                followers_count: 0,
                following_count: 0,
                is_following: false
            };
        }

        const social = this.readSocial();
        const viewer = this.findCanonicalUsername(viewerUsername);
        const followersCount = social.follows.filter((entry) => entry.following === target.username).length;
        const followingCount = social.follows.filter((entry) => entry.follower === target.username).length;
        const isFollowing = viewer
            ? social.follows.some((entry) => entry.follower === viewer && entry.following === target.username)
            : false;

        const tier = this.checkTier(target.username);
        const isFan = viewer ? (target.fans || []).includes(viewer) : false;

        return {
            username: target.username,
            bio: target.bio || 'New Artist',
            avatar: avatarForUser(target.username, target.avatar),
            header: target.header || '',
            followers_count: followersCount,
            following_count: followingCount,
            is_following: isFollowing,
            tier,
            momentum: this.computeMomentum(tier ? target.username : target.username),
            fan_count: (target.fans || []).length,
            is_fan: isFan,
            collab_profile: target.collab_profile || null,
            mentor: target.mentor || false,
            streak: target.streak || 0,
            longest_streak: target.longest_streak || 0,
            achievements: Array.isArray(target.achievements) ? target.achievements : []
        };
    }

    toggleFollow(username, targetUsername) {
        const follower = this.findCanonicalUsername(username);
        const following = this.findCanonicalUsername(targetUsername);

        if (!follower || !following || follower === following) {
            return { success: false, message: 'Invalid users.' };
        }

        const social = this.readSocial();
        const existingIndex = social.follows.findIndex(
            (entry) => entry.follower === follower && entry.following === following
        );

        if (existingIndex >= 0) {
            social.follows.splice(existingIndex, 1);
            this.writeSocial(social);
            return { success: true, is_following: false };
        }

        social.follows.push({ follower, following });
        this.writeSocial(social);
        this.createNotification(following, follower, 'follow', 'started following you');
        return { success: true, is_following: true };
    }

    listFollowers(targetUsername) {
        const target = this.findCanonicalUsername(targetUsername);
        if (!target) {
            return [];
        }

        const users = this.readUsers();
        const social = this.readSocial();
        return social.follows
            .filter((entry) => entry.following === target)
            .map((entry) => ({
                username: entry.follower,
                avatar: avatarForUser(entry.follower, users[entry.follower]?.avatar),
                bio: users[entry.follower]?.bio || 'Artist'
            }));
    }

    listFollowing(targetUsername) {
        const target = this.findCanonicalUsername(targetUsername);
        if (!target) {
            return [];
        }

        const users = this.readUsers();
        const social = this.readSocial();
        return social.follows
            .filter((entry) => entry.follower === target)
            .map((entry) => ({
                username: entry.following,
                avatar: avatarForUser(entry.following, users[entry.following]?.avatar),
                bio: users[entry.following]?.bio || 'Artist'
            }));
    }

    toggleSave(username, videoId) {
        const viewer = this.findCanonicalUsername(username);
        if (!viewer) {
            return { success: false, message: 'Invalid user.' };
        }

        const social = this.readSocial();
        const existingIndex = social.saves.findIndex(
            (entry) => entry.username === viewer && String(entry.videoId) === String(videoId)
        );

        if (existingIndex >= 0) {
            social.saves.splice(existingIndex, 1);
            this.writeSocial(social);
            return { success: true, status: 'removed' };
        }

        social.saves.push({ username: viewer, videoId: String(videoId) });
        this.writeSocial(social);
        return { success: true, status: 'added' };
    }

    likeVideo(username, videoId) {
        const viewer = this.findCanonicalUsername(username);
        if (!viewer) {
            return { success: false, message: 'Invalid user.' };
        }

        const videos = this.readVideos();
        const video = videos.find((item) => item.id === String(videoId));
        if (!video) {
            return { success: false, message: 'Video not found.' };
        }

        const social = this.readSocial();
        const alreadyLiked = social.videoLikes.some(
            (entry) => entry.username === viewer && String(entry.videoId) === video.id
        );

        if (!alreadyLiked) {
            social.videoLikes.push({ username: viewer, videoId: video.id });
            this.writeSocial(social);
            this.createNotification(video.username, viewer, 'like', 'liked your drop', video.id);
        }

        return { success: true };
    }

    recordView(username, videoId) {
        const viewer = this.findCanonicalUsername(username);
        const social = this.readSocial();
        social.videoViews.push({
            username: viewer || 'anonymous',
            videoId: String(videoId),
            timestamp: Date.now()
        });
        this.writeSocial(social);
        return { success: true };
    }

    getViews(videoId) {
        const social = this.readSocial();
        return social.videoViews.filter((entry) => String(entry.videoId) === String(videoId)).length;
    }

    reportVideo(reporterUsername, videoId, reason) {
        const reporter = this.findCanonicalUsername(reporterUsername);
        if (!reporter) return { success: false, message: 'Invalid user.' };
        const social = this.readSocial();
        social.reports.push({
            reporter,
            videoId: String(videoId),
            reason: String(reason || '').trim().slice(0, 200) || 'No reason given',
            timestamp: Date.now()
        });
        this.writeSocial(social);
        return { success: true };
    }

    blockUser(blockerUsername, blockedUsername) {
        const blocker = this.findCanonicalUsername(blockerUsername);
        const blocked = this.findCanonicalUsername(blockedUsername);
        if (!blocker || !blocked || blocker === blocked) return { success: false, message: 'Invalid users.' };
        const social = this.readSocial();
        if (social.blocks.some((b) => b.blocker === blocker && b.blocked === blocked)) {
            return { success: false, message: 'Already blocked.' };
        }
        social.blocks.push({ blocker, blocked });
        // Also unfollow if following
        social.follows = social.follows.filter(
            (f) => !(f.follower === blocker && f.following === blocked)
        );
        this.writeSocial(social);
        return { success: true, is_blocked: true };
    }

    unblockUser(blockerUsername, blockedUsername) {
        const blocker = this.findCanonicalUsername(blockerUsername);
        const blocked = this.findCanonicalUsername(blockedUsername);
        if (!blocker || !blocked) return { success: false, message: 'Invalid users.' };
        const social = this.readSocial();
        social.blocks = social.blocks.filter(
            (b) => !(b.blocker === blocker && b.blocked === blocked)
        );
        this.writeSocial(social);
        return { success: true, is_blocked: false };
    }

    getBlockedUsers(username) {
        const viewer = this.findCanonicalUsername(username);
        if (!viewer) return [];
        const social = this.readSocial();
        const users = this.readUsers();
        return social.blocks
            .filter((b) => b.blocker === viewer)
            .map((b) => ({
                username: b.blocked,
                avatar: avatarForUser(b.blocked, users[b.blocked]?.avatar),
                bio: users[b.blocked]?.bio || 'Artist'
            }));
    }

    addMutedWord(username, word) {
        const user = this.findCanonicalUsername(username);
        if (!user) return { success: false, message: 'Invalid user.' };
        const cleaned = String(word || '').trim().toLowerCase().slice(0, 30);
        if (!cleaned) return { success: false, message: 'Invalid word.' };
        const users = this.readUsers();
        const muted = users[user].mutedWords || [];
        if (muted.includes(cleaned)) return { success: false, message: 'Already muted.' };
        users[user].mutedWords = [...muted, cleaned].slice(0, 20);
        this.writeUsers(users);
        return { success: true, mutedWords: users[user].mutedWords };
    }

    removeMutedWord(username, word) {
        const user = this.findCanonicalUsername(username);
        if (!user) return { success: false, message: 'Invalid user.' };
        const cleaned = String(word || '').trim().toLowerCase();
        if (!cleaned) return { success: false, message: 'Invalid word.' };
        const users = this.readUsers();
        users[user].mutedWords = (users[user].mutedWords || []).filter((w) => w !== cleaned);
        this.writeUsers(users);
        return { success: true, mutedWords: users[user].mutedWords };
    }

    addComment(username, videoId, text, parentId = null) {
        const viewer = this.findCanonicalUsername(username);
        if (!viewer) {
            return { success: false, message: 'Invalid user.' };
        }

        const body = String(text || '').trim();
        if (!body) {
            return { success: false, message: 'Comment cannot be empty.' };
        }

        const videos = this.readVideos(true);
        const video = videos.find((item) => item.id === String(videoId));
        if (!video) {
            return { success: false, message: 'Video not found.' };
        }

        const comment = {
            id: createId('cmt'),
            username: viewer,
            text: body,
            parent_id: parentId ? String(parentId) : null,
            likes: 0,
            timestamp: Date.now()
        };

        video.comments.push(comment);
        this.writeVideos(videos);
        this.createNotification(video.username, viewer, 'comment', 'commented on your drop', video.id);
        return { success: true, comment };
    }

    listComments(videoId, viewerUsername) {
        const viewer = this.findCanonicalUsername(viewerUsername);
        const videos = this.readVideos();
        const video = videos.find((item) => item.id === String(videoId));
        if (!video) {
            return [];
        }

        const users = this.readUsers();
        const social = this.readSocial();

        return video.comments
            .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
            .map((comment) => {
                const relationLikes = social.commentLikes.filter(
                    (entry) => entry.commentId === comment.id
                ).length;

                return {
                    id: comment.id,
                    username: comment.username,
                    avatar: avatarForUser(comment.username, users[comment.username]?.avatar),
                    text: comment.text,
                    parent_id: comment.parent_id,
                    likes: Number(comment.likes || 0) + relationLikes,
                    has_liked: viewer
                        ? social.commentLikes.some(
                            (entry) => entry.username === viewer && entry.commentId === comment.id
                        )
                        : false,
                    created_at: comment.timestamp
                };
            });
    }

    deleteComment(username, commentId) {
        const viewer = this.findCanonicalUsername(username);
        if (!viewer) {
            return { success: false, message: 'Invalid user.' };
        }

        const videos = this.readVideos(true);
        let found = false;

        for (const video of videos) {
            const cIndex = video.comments.findIndex((c) => c.id === String(commentId));
            if (cIndex < 0) continue;
            const comment = video.comments[cIndex];
            if (comment.username !== viewer && video.username !== viewer) {
                return { success: false, message: 'Not authorized.' };
            }
            video.comments.splice(cIndex, 1);
            found = true;
            break;
        }

        if (!found) {
            return { success: false, message: 'Comment not found.' };
        }

        this.writeVideos(videos);
        return { success: true };
    }

    likeComment(username, commentId) {
        const viewer = this.findCanonicalUsername(username);
        if (!viewer) {
            return { success: false, message: 'Invalid user.' };
        }

        const videos = this.readVideos();
        const targetVideo = videos.find((video) => (
            video.comments.some((comment) => comment.id === String(commentId))
        ));
        const commentOwner = targetVideo?.comments.find((comment) => comment.id === String(commentId));

        if (!commentOwner) {
            return { success: false, message: 'Comment not found.' };
        }

        const social = this.readSocial();
        const exists = social.commentLikes.some(
            (entry) => entry.username === viewer && entry.commentId === commentOwner.id
        );

        if (!exists) {
            social.commentLikes.push({ username: viewer, commentId: commentOwner.id });
            this.writeSocial(social);
            this.createNotification(
                commentOwner.username,
                viewer,
                'comment_like',
                'liked your comment',
                targetVideo?.id || null
            );
        }

        return { success: true };
    }

    sendMessage(senderUsername, receiverUsername, text) {
        const sender = this.findCanonicalUsername(senderUsername);
        const receiver = this.findCanonicalUsername(receiverUsername);
        const messageText = String(text || '').trim();

        if (!sender || !receiver || !messageText) {
            return { success: false, message: 'Invalid message.' };
        }

        const messages = this.readMessages();
        messages.push({
            id: createId('msg'),
            sender,
            receiver,
            text: messageText,
            created_at: new Date().toISOString()
        });
        this.writeMessages(messages);
        this.createNotification(receiver, sender, 'message', 'sent you a message');
        return { success: true };
    }

    listChats(username) {
        const viewer = this.findCanonicalUsername(username);
        if (!viewer) {
            return [];
        }

        const messages = this.readMessages();
        const byUser = new Map();

        messages.forEach((message) => {
            if (message.sender !== viewer && message.receiver !== viewer) {
                return;
            }

            const otherUser = message.sender === viewer ? message.receiver : message.sender;
            const existing = byUser.get(otherUser);
            if (!existing || new Date(message.created_at) > new Date(existing.created_at)) {
                byUser.set(otherUser, message);
            }
        });

        return Array.from(byUser.values())
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map((message) => ({
                sender: message.sender,
                receiver: message.receiver,
                last_msg: message.text,
                created_at: message.created_at
            }));
    }

    listMessages(username, otherUsername) {
        const viewer = this.findCanonicalUsername(username);
        const other = this.findCanonicalUsername(otherUsername);
        if (!viewer || !other) {
            return [];
        }

        return this.readMessages()
            .filter((message) => (
                (message.sender === viewer && message.receiver === other) ||
                (message.sender === other && message.receiver === viewer)
            ))
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map((message) => ({
                ...message,
                sender_id: message.sender,
                current_user_id: viewer
            }));
    }

    listNotifications(username) {
        const viewer = this.findCanonicalUsername(username);
        if (!viewer) {
            return [];
        }

        const users = this.readUsers();
        const notifications = this.readNotifications();
        const viewerNotifications = notifications
            .filter((notification) => notification.user_to === viewer)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 20)
            .map((notification) => ({
                ...notification,
                actor_name: notification.user_from,
                actor_avatar: avatarForUser(notification.user_from, users[notification.user_from]?.avatar)
            }));

        notifications.forEach((notification) => {
            if (notification.user_to === viewer) {
                notification.is_read = 1;
            }
        });
        this.writeNotifications(notifications);

        return viewerNotifications;
    }

    searchUsers(query) {
        const needle = String(query || '').trim().toLowerCase();
        if (!needle) {
            return [];
        }

        const users = this.readUsers();
        return Object.entries(users)
            .filter(([username, profile]) => (
                username.toLowerCase().includes(needle) ||
                String(profile.bio || '').toLowerCase().includes(needle)
            ))
            .slice(0, 10)
            .map(([username, profile]) => ({
                username,
                avatar: avatarForUser(username, profile.avatar),
                bio: profile.bio || 'Artist'
            }));
    }

    readDrafts() {
        return readJson(this.files.drafts, []);
    }

    writeDrafts(drafts) {
        writeJson(this.files.drafts, drafts);
    }

    getDrafts(username) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) return [];
        return this.readDrafts().filter((d) => d.username === owner).sort(sortByNewest);
    }

    saveDraft(username, draft) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) return { success: false, message: 'Invalid user.' };
        const drafts = this.readDrafts();
        const existing = drafts.findIndex((d) => d.id === draft.id && d.username === owner);
        const entry = {
            id: draft.id || createId('dft'),
            username: owner,
            bio: String(draft.bio || '').trim().slice(0, 280),
            tags: normalizeTags(draft.tags),
            song_title: String(draft.song_title || '').trim().slice(0, 100),
            producer: String(draft.producer || '').trim().slice(0, 60),
            lyrics: String(draft.lyrics || '').trim().slice(0, 2000),
            mediaPath: draft.mediaPath || '',
            filename: draft.filename || '',
            timestamp: Date.now()
        };
        if (existing >= 0) { drafts[existing] = entry; }
        else { drafts.push(entry); }
        this.writeDrafts(drafts);
        return { success: true, draft: entry };
    }

    deleteDraft(draftId, username) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) return { success: false, message: 'Invalid user.' };
        const drafts = this.readDrafts();
        const idx = drafts.findIndex((d) => d.id === draftId && d.username === owner);
        if (idx < 0) return { success: false, message: 'Draft not found.' };
        drafts.splice(idx, 1);
        this.writeDrafts(drafts);
        return { success: true };
    }

    getPublicFeed(username) {
        const target = this.findCanonicalUsername(username);
        if (!target) return { success: false, message: 'User not found.' };
        const users = this.readUsers();
        const videos = this.readVideos();
        const user = users[target] || {};
        const userVideos = videos.filter((v) => v.username === target).sort(sortByNewest).slice(0, 6).map((v) => ({
            id: v.id,
            video: normalizeMediaPath(v.video),
            bio: v.bio || '',
            likes: v.likes || 0,
            tags: v.tags || [],
            timestamp: v.timestamp
        }));
        return {
            success: true,
            username: target,
            bio: user.bio || 'New Artist',
            avatar: avatarForUser(target, user.avatar),
            header: user.header || '',
            links: Array.isArray(user.links) ? user.links : [],
            total_drops: videos.filter((v) => v.username === target).length,
            videos: userVideos
        };
    }

    getRadioFeed(genre, excludeIds = [], limit = 30) {
        let videos = this.readVideos();
        if (genre && genre !== 'ALL CITY') {
            const g = genre.toLowerCase();
            videos = videos.filter((v) => Array.isArray(v.tags) && v.tags.some((t) => t.toLowerCase().includes(g)));
        }
        const exclude = new Set(excludeIds.map(String));
        const available = videos.filter((v) => !exclude.has(v.id));
        const shuffled = available.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, limit).map((v) => ({
            id: v.id,
            video: normalizeMediaPath(v.video),
            username: v.username,
            bio: v.bio || '',
            tags: v.tags || []
        }));
    }

    publishScheduledDrafts() {
        const drafts = this.readDrafts();
        const now = Date.now();
        let published = 0;
        drafts.forEach((d) => {
            if (d.scheduled_at && Number(d.scheduled_at) <= now) {
                const result = this.addVideo({
                    username: d.username,
                    bio: d.bio || 'New Drop',
                    tags: d.tags || ['rap'],
                    mediaPath: d.mediaPath,
                    song_title: d.song_title,
                    producer: d.producer,
                    lyrics: d.lyrics
                });
                if (result.success) {
                    this.deleteDraft(d.id, d.username);
                    published++;
                }
            }
        });
        return published;
    }

    getSoundVideos(soundId, limit = 20) {
        if (!soundId) return [];
        const videos = this.readVideos();
        return videos
            .filter((v) => v.original_sound_id === String(soundId))
            .slice(0, limit)
            .map((v) => v.id);
    }

    updateStreak(username) {
        const user = this.findCanonicalUsername(username);
        if (!user) return;
        const users = this.readUsers();
        const today = new Date().toISOString().slice(0, 10);
        const last = users[user].last_drop_date || 0;
        const lastStr = typeof last === 'number' ? new Date(last).toISOString().slice(0, 10) : String(last).slice(0, 10);
        if (lastStr === today) return; // already dropped today
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (lastStr === yesterday) {
            users[user].streak = (users[user].streak || 0) + 1;
        } else {
            users[user].streak = 1;
        }
        if (users[user].streak > (users[user].longest_streak || 0)) {
            users[user].longest_streak = users[user].streak;
        }
        users[user].last_drop_date = today;
        writeJson(this.files.users, users);
        this.checkAchievements(user);
    }

    checkAchievements(username) {
        const user = this.findCanonicalUsername(username);
        if (!user) return [];
        const users = this.readUsers();
        const profile = users[user];
        const earned = new Set(profile.achievements || []);
        const newOnes = [];
        const allVids = this.readVideos().filter((v) => v.username === user);
        const social = this.readSocial();
        const totalViews = social.videoViews.filter((v) => allVids.some((vid) => vid.id === v.videoId)).length;
        const totalLikes = social.videoLikes.filter((v) => allVids.some((vid) => vid.id === v.videoId)).length;

        const checks = [
            { id: 'first_drop', label: 'First Drop', condition: allVids.length >= 1 },
            { id: 'ten_drops', label: 'Dropper', condition: allVids.length >= 10 },
            { id: 'hundred_views', label: 'Century', condition: totalViews >= 100 },
            { id: 'thousand_views', label: 'Million', condition: totalViews >= 1000 },
            { id: 'hundred_likes', label: 'Hundo', condition: totalLikes >= 100 },
            { id: 'streak_7', label: '7-Day Streak', condition: (profile.streak || 0) >= 7 },
            { id: 'streak_30', label: 'Dedicated', condition: (profile.longest_streak || 0) >= 30 },
        ];

        checks.forEach((c) => {
            if (c.condition && !earned.has(c.id)) {
                earned.add(c.id);
                newOnes.push({ id: c.id, label: c.label });
            }
        });

        if (newOnes.length) {
            profile.achievements = Array.from(earned);
            this.writeUsers(users);
        }

        return newOnes;
    }

    getAchievements(username) {
        const user = this.findCanonicalUsername(username);
        if (!user) return [];
        return this.readUsers()[user]?.achievements || [];
    }

    readBeats() { return readJson(this.files.beats, []); }
    writeBeats(beats) { writeJson(this.files.beats, beats); }

    uploadBeat({ username, title, bpm, genre, filePath, duration }) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) return { success: false, message: 'Invalid user.' };
        const beats = this.readBeats();
        const beat = { id: createId('bt'), username: owner, title: String(title || '').trim().slice(0, 100), bpm: Number(bpm) || 0, genre: String(genre || '').trim().toLowerCase().slice(0, 30), filePath: filePath || '', duration: Number(duration) || 0, requests: [], timestamp: Date.now() };
        beats.push(beat);
        this.writeBeats(beats);
        return { success: true, beat };
    }

    listBeats({ genre, bpmMin, bpmMax, sort } = {}) {
        let beats = this.readBeats();
        const users = this.readUsers();
        if (genre) { const g = genre.toLowerCase(); beats = beats.filter((b) => b.genre.includes(g)); }
        if (bpmMin) beats = beats.filter((b) => b.bpm >= bpmMin);
        if (bpmMax) beats = beats.filter((b) => b.bpm <= bpmMax);
        if (sort === 'newest') beats.sort((a, b) => b.timestamp - a.timestamp);
        return beats.map((b) => ({ ...b, producer: b.username, avatar: avatarForUser(b.username, users[b.username]?.avatar) }));
    }

    requestBeat(rapperUsername, beatId, message) {
        const rapper = this.findCanonicalUsername(rapperUsername);
        if (!rapper) return { success: false, message: 'Invalid user.' };
        const beats = this.readBeats();
        const beat = beats.find((b) => b.id === beatId);
        if (!beat) return { success: false, message: 'Beat not found.' };
        if (beat.requests.some((r) => r.rapper === rapper && r.status === 'pending')) return { success: false, message: 'Already requested.' };
        beat.requests.push({ rapper, message: String(message || '').trim().slice(0, 200), status: 'pending', timestamp: Date.now() });
        this.writeBeats(beats);
        this.createNotification(beat.username, rapper, 'beat_request', `wants to use your beat`);
        return { success: true };
    }

    approveBeatRequest(producerUsername, beatId, rapperUsername) {
        const producer = this.findCanonicalUsername(producerUsername);
        if (!producer) return { success: false, message: 'Invalid user.' };
        const beats = this.readBeats();
        const beat = beats.find((b) => b.id === beatId && b.username === producer);
        if (!beat) return { success: false, message: 'Beat not found.' };
        const req = beat.requests.find((r) => r.rapper === rapperUsername);
        if (!req) return { success: false, message: 'Request not found.' };
        req.status = 'approved';
        this.writeBeats(beats);
        this.createNotification(rapperUsername, producer, 'beat_approved', `approved your beat request`);
        return { success: true, beat };
    }

    getMyBeats(username) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) return [];
        return this.listBeats().filter((b) => b.username === owner);
    }

    getPendingRequests(username) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) return [];
        return this.readBeats().filter((b) => b.username === owner).flatMap((b) => b.requests.filter((r) => r.status === 'pending').map((r) => ({ ...r, beatTitle: b.title, beatId: b.id })));
    }

    readChallenges() { return readJson(this.files.challenges, []); }
    writeChallenges(challenges) { writeJson(this.files.challenges, challenges); }

    createChallenge({ title, created_by, genre_tag, deadline, prize }) {
        const owner = this.findCanonicalUsername(created_by);
        if (!owner) return { success: false, message: 'Invalid user.' };
        const challenges = this.readChallenges();
        const challenge = { id: createId('chl'), title: String(title || '').trim().slice(0, 100), created_by: owner, genre_tag: String(genre_tag || '').trim().toLowerCase(), deadline: Number(deadline) || (Date.now() + 7 * 86400000), prize: String(prize || '').trim().slice(0, 200), entries: [], winners: [], status: 'active', created_at: Date.now() };
        challenges.push(challenge);
        this.writeChallenges(challenges);
        return { success: true, challenge };
    }

    listChallenges(status) {
        let challenges = this.readChallenges();
        if (status) challenges = challenges.filter((c) => c.status === status);
        return challenges.sort((a, b) => b.created_at - a.created_at).map((c) => ({
            ...c, entry_count: c.entries.length, created_by_name: c.created_by
        }));
    }

    joinChallenge(challengeId, videoId, username) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) return { success: false, message: 'Invalid user.' };
        const challenges = this.readChallenges();
        const challenge = challenges.find((c) => c.id === challengeId && c.status === 'active');
        if (!challenge) return { success: false, message: 'Challenge not found or closed.' };
        if (challenge.entries.includes(videoId)) return { success: false, message: 'Already entered.' };
        challenge.entries.push(videoId);
        this.writeChallenges(challenges);
        return { success: true };
    }

    checkTier(username) {
        const user = this.findCanonicalUsername(username);
        if (!user) return 'emerging';
        const users = this.readUsers();
        const profile = users[user];
        const social = this.readSocial();
        const allVids = this.readVideos().filter((v) => v.username === user);
        const totalViews = social.videoViews.filter((v) => allVids.some((vid) => vid.id === v.videoId)).length;
        const followerCount = social.follows.filter((e) => e.following === user).length;
        const fanCount = (profile.fans || []).length;
        const dropCount = allVids.length;

        let tier = 'emerging';
        if (dropCount >= 10 && totalViews >= 1000 && followerCount >= 50) tier = 'verified';
        else if (dropCount >= 3 && totalViews >= 100 && followerCount >= 10) tier = 'rising';

        if (tier !== profile.tier) {
            users[user].tier = tier;
            this.writeUsers(users);
        }
        return tier;
    }

    becomeFan(fanUsername, artistUsername) {
        const fan = this.findCanonicalUsername(fanUsername);
        const artist = this.findCanonicalUsername(artistUsername);
        if (!fan || !artist || fan === artist) return { success: false };
        const users = this.readUsers();
        const fanList = users[artist].fans || [];
        const fanOfList = users[fan].fanOf || [];
        if (fanList.includes(fan)) {
            users[artist].fans = fanList.filter((f) => f !== fan);
            users[fan].fanOf = fanOfList.filter((a) => a !== artist);
            this.writeUsers(users);
            return { success: true, is_fan: false };
        }
        users[artist].fans = [...fanList, fan];
        users[fan].fanOf = [...fanOfList, artist];
        this.writeUsers(users);
        this.createNotification(artist, fan, 'follow', 'became your fan!');
        return { success: true, is_fan: true };
    }

    updateCollabProfile(username, profile) {
        const user = this.findCanonicalUsername(username);
        if (!user) return { success: false };
        const users = this.readUsers();
        users[user].collab_profile = {
            looking: profile.looking === true,
            role: ['vocalist', 'producer', 'engineer', 'both'].includes(profile.role) ? profile.role : 'vocalist',
            genres: Array.isArray(profile.genres) ? profile.genres.slice(0, 5).map((g) => String(g).toLowerCase().trim()).filter(Boolean) : [],
            availability: profile.availability || 'flexible',
            bio: String(profile.bio || '').trim().slice(0, 200)
        };
        this.writeUsers(users);
        return { success: true, collab_profile: users[user].collab_profile };
    }

    findCollabPartners(username, limit = 20) {
        const user = this.findCanonicalUsername(username);
        if (!user) return [];
        const users = this.readUsers();
        const social = this.readSocial();
        const myProfile = users[user].collab_profile || {};
        const myRole = myProfile.role || 'vocalist';
        const myGenres = myProfile.genres || [];
        const complementaryRole = myRole === 'vocalist' ? ['producer', 'both'] : myRole === 'producer' ? ['vocalist', 'both'] : ['vocalist', 'producer'];

        const candidates = Object.entries(users)
            .filter(([name, data]) => {
                if (name === user) return false;
                const cp = data.collab_profile || {};
                if (!cp.looking) return false;
                if (!complementaryRole.includes(cp.role)) return false;
                if (myGenres.length && cp.genres.length) {
                    const overlap = cp.genres.some((g) => myGenres.includes(g));
                    if (!overlap) return false;
                }
                return true;
            })
            .map(([name, data]) => {
                const isFollowed = social.follows.some((f) => f.follower === user && f.following === name);
                const followerCount = social.follows.filter((f) => f.following === name).length;
                const dropCount = this.readVideos().filter((v) => v.username === name).length;
                return { username: name, tier: data.tier || 'emerging', role: (data.collab_profile || {}).role, genres: (data.collab_profile || {}).genres, bio: (data.collab_profile || {}).bio, is_followed: isFollowed, followers: followerCount, drops: dropCount };
            })
            .sort((a, b) => {
                if (a.is_followed !== b.is_followed) return a.is_followed ? -1 : 1;
                return b.followers - a.followers;
            })
            .slice(0, limit);

        return candidates;
    }

    // --- SCENES ---
    readScenes() { return readJson(this.files.scenes || path.join(this.rootDir, 'scenes.json'), []); }
    writeScenes(scenes) { writeJson(this.files.scenes || path.join(this.rootDir, 'scenes.json'), scenes); }

    createScene({ name, description, created_by, tags }) {
        const owner = this.findCanonicalUsername(created_by);
        if (!owner) return { success: false };
        if (!this.files.scenes) this.files.scenes = path.join(this.rootDir, 'scenes.json');
        const scenes = this.readScenes();
        if (scenes.some((s) => s.name.toLowerCase() === (name || '').toLowerCase())) return { success: false, message: 'Scene already exists.' };
        const scene = { id: createId('scn'), name: String(name || '').trim().slice(0, 50), description: String(description || '').trim().slice(0, 300), created_by: owner, tags: Array.isArray(tags) ? tags.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 5) : [], members: [owner], created_at: Date.now() };
        scenes.push(scene);
        this.writeScenes(scenes);
        return { success: true, scene };
    }

    joinScene(sceneId, username) {
        const user = this.findCanonicalUsername(username);
        if (!user) return { success: false };
        if (!this.files.scenes) this.files.scenes = path.join(this.rootDir, 'scenes.json');
        const scenes = this.readScenes();
        const scene = scenes.find((s) => s.id === sceneId);
        if (!scene) return { success: false };
        if (scene.members.includes(user)) {
            scene.members = scene.members.filter((m) => m !== user);
            this.writeScenes(scenes);
            return { success: true, is_member: false };
        }
        scene.members.push(user);
        this.writeScenes(scenes);
        return { success: true, is_member: true };
    }

    listScenes() {
        if (!this.files.scenes) this.files.scenes = path.join(this.rootDir, 'scenes.json');
        return this.readScenes().sort((a, b) => b.members.length - a.members.length).map((s) => ({
            id: s.id, name: s.name, description: s.description, tags: s.tags, member_count: s.members.length, created_by: s.created_by, created_at: s.created_at
        }));
    }

    getSceneFeed(sceneId) {
        if (!this.files.scenes) this.files.scenes = path.join(this.rootDir, 'scenes.json');
        const scenes = this.readScenes();
        const scene = scenes.find((s) => s.id === sceneId);
        if (!scene) return [];
        const videos = this.readVideos().filter((v) => v.tags && v.tags.some((t) => scene.tags.includes(t))).sort(sortByNewest).slice(0, 50);
        return videos.map((v) => ({ id: v.id, video: normalizeMediaPath(v.video), username: v.username, bio: v.bio, tags: v.tags }));
    }

    computeMomentum(username) {
        const user = this.findCanonicalUsername(username);
        if (!user) return 0;
        const users = this.readUsers();
        const social = this.readSocial();
        const allVids = this.readVideos().filter((v) => v.username === user);
        const sevenDays = Date.now() - 7 * 86400000;

        const recentViews = social.videoViews.filter((v) => allVids.some((vid) => vid.id === v.videoId) && v.timestamp >= sevenDays).length;
        const recentLikes = social.videoLikes.filter((v) => allVids.some((vid) => vid.id === v.videoId)).length;
        const newFans = (users[user]?.fans || []).length;
        const dropsThisWeek = allVids.filter((v) => v.timestamp >= sevenDays).length;
        const chartAppearances = allVids.filter((v) => v.likes >= 5).length;

        const viewScore = Math.min(recentViews / 50, 40);
        const fanScore = Math.min(newFans * 4, 25);
        const consistencyScore = Math.min(dropsThisWeek * 10, 15);
        const chartScore = Math.min(chartAppearances * 5, 10);
        const streakBonus = Math.min((users[user]?.streak || 0) * 2, 10);

        return Math.round(Math.min(viewScore + fanScore + consistencyScore + chartScore + streakBonus, 100));
    }

    // --- BATTLES ---
    readBattles() { return readJson(this.files.battles || path.join(this.rootDir, 'battles.json'), []); }
    writeBattles(b) { writeJson(this.files.battles || path.join(this.rootDir, 'battles.json'), b); }

    createBattle({ artist1, artist2, beat_id, deadline }) {
        const a1 = this.findCanonicalUsername(artist1);
        const a2 = this.findCanonicalUsername(artist2);
        if (!a1 || !a2) return { success: false, message: 'Invalid artists.' };
        if (!this.files.battles) this.files.battles = path.join(this.rootDir, 'battles.json');
        const battle = { id: createId('btl'), artist1: a1, artist2: a2, beat_id: beat_id || '', entries: [], votes: [], status: 'pending', deadline: Number(deadline) || (Date.now() + 48 * 3600000), winner: null, created_at: Date.now() };
        const battles = this.readBattles();
        battles.push(battle);
        this.writeBattles(battles);
        this.createNotification(a1, 'system', 'battle', `You've been matched for a beat battle!`);
        this.createNotification(a2, 'system', 'battle', `You've been matched for a beat battle!`);
        return { success: true, battle };
    }

    listBattles(status) {
        if (!this.files.battles) this.files.battles = path.join(this.rootDir, 'battles.json');
        let battles = this.readBattles();
        if (status) battles = battles.filter((b) => b.status === status);
        return battles.sort((a, b) => b.created_at - a.created_at).map((b) => ({
            ...b, artist1_name: b.artist1, artist2_name: b.artist2, entry_count: b.entries.length, vote_count: b.votes.length
        }));
    }

    joinBattle(battleId, username, video_url) {
        const user = this.findCanonicalUsername(username);
        if (!user) return { success: false };
        if (!this.files.battles) this.files.battles = path.join(this.rootDir, 'battles.json');
        const battles = this.readBattles();
        const battle = battles.find((b) => b.id === battleId && b.status === 'pending');
        if (!battle) return { success: false, message: 'Battle not found or closed.' };
        const side = user === battle.artist1 ? 'artist1' : user === battle.artist2 ? 'artist2' : null;
        if (!side) return { success: false, message: 'You are not in this battle.' };
        if (battle.entries.some((e) => e.username === user)) return { success: false, message: 'Already submitted.' };
        battle.entries.push({ username: user, video_url: String(video_url || ''), timestamp: Date.now() });
        if (battle.entries.length === 2) battle.status = 'voting';
        this.writeBattles(battles);
        return { success: true, battle };
    }

    castBattleVote(voterUsername, battleId, entryUsername) {
        const voter = this.findCanonicalUsername(voterUsername);
        if (!voter) return { success: false };
        if (!this.files.battles) this.files.battles = path.join(this.rootDir, 'battles.json');
        const battles = this.readBattles();
        const battle = battles.find((b) => b.id === battleId && b.status === 'voting');
        if (!battle) return { success: false, message: 'Battle not found or not in voting phase.' };
        if (battle.votes.some((v) => v.voter === voter)) return { success: false, message: 'Already voted.' };
        const target = this.findCanonicalUsername(entryUsername);
        if (!target || !battle.entries.some((e) => e.username === target)) return { success: false, message: 'Invalid entry.' };
        battle.votes.push({ voter, entry: target, timestamp: Date.now() });
        if (battle.votes.length >= 10) {
            const tally = {};
            battle.votes.forEach((v) => { tally[v.entry] = (tally[v.entry] || 0) + 1; });
            battle.winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
            battle.status = 'closed';
        }
        this.writeBattles(battles);
        return { success: true, vote_count: battle.votes.length };
    }

    closeBattle(battleId) {
        if (!this.files.battles) this.files.battles = path.join(this.rootDir, 'battles.json');
        const battles = this.readBattles();
        const battle = battles.find((b) => b.id === battleId && b.status === 'voting');
        if (!battle) return { success: false };
        const tally = {};
        battle.votes.forEach((v) => { tally[v.entry] = (tally[v.entry] || 0) + 1; });
        battle.winner = Object.keys(tally).length ? Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0] : battle.entries[0]?.username || null;
        battle.status = 'closed';
        this.writeBattles(battles);
        if (battle.winner) this.createNotification(battle.winner, 'system', 'battle_win', 'You won the beat battle!');
        return { success: true, winner: battle.winner };
    }

    // --- FEEDBACK ---
    readFeedback() { return readJson(this.files.feedback || path.join(this.rootDir, 'feedback.json'), []); }
    writeFeedback(f) { writeJson(this.files.feedback || path.join(this.rootDir, 'feedback.json'), f); }

    requestFeedback(videoId, username) {
        const user = this.findCanonicalUsername(username);
        if (!user) return { success: false };
        if (!this.files.feedback) this.files.feedback = path.join(this.rootDir, 'feedback.json');
        const feedbacks = this.readFeedback();
        const unreviewed = feedbacks.filter((f) => !f.reviewed && f.from !== user).length;
        const given = feedbacks.filter((f) => f.from === user && f.reviewed).length;
        if (given - unreviewed < 0 && unreviewed >= 3) return { success: false, message: 'Review 3 drops before requesting feedback.' };
        if (feedbacks.some((f) => f.video_id === videoId && f.from === user)) return { success: false, message: 'Already requested.' };
        feedbacks.push({ id: createId('fb'), video_id: String(videoId), from: user, what_worked: '', what_improve: '', helpful: 0, reviewed: false, created_at: Date.now() });
        this.writeFeedback(feedbacks);
        return { success: true };
    }

    submitFeedback(feedbackId, username, whatWorked, whatImprove) {
        const user = this.findCanonicalUsername(username);
        if (!user) return { success: false };
        if (!this.files.feedback) this.files.feedback = path.join(this.rootDir, 'feedback.json');
        const feedbacks = this.readFeedback();
        const fb = feedbacks.find((f) => f.id === feedbackId && !f.reviewed);
        if (!fb) return { success: false, message: 'Feedback request not found.' };
        fb.what_worked = String(whatWorked || '').trim().slice(0, 200);
        fb.what_improve = String(whatImprove || '').trim().slice(0, 200);
        fb.reviewer = user;
        fb.reviewed = true;
        fb.reviewed_at = Date.now();
        this.writeFeedback(feedbacks);
        this.createNotification(fb.from, user, 'feedback', 'gave you feedback on your drop');
        return { success: true };
    }

    getFeedbackForVideo(videoId) {
        if (!this.files.feedback) this.files.feedback = path.join(this.rootDir, 'feedback.json');
        return this.readFeedback().filter((f) => f.video_id === videoId && f.reviewed).map((f) => ({
            id: f.id, what_worked: f.what_worked, what_improve: f.what_improve, reviewer: f.reviewer, helpful: f.helpful
        }));
    }

    getPendingFeedback(username) {
        const user = this.findCanonicalUsername(username);
        if (!user) return [];
        if (!this.files.feedback) this.files.feedback = path.join(this.rootDir, 'feedback.json');
        return this.readFeedback().filter((f) => !f.reviewed && f.from !== user);
    }

    voteHelpful(feedbackId, username) {
        if (!this.files.feedback) this.files.feedback = path.join(this.rootDir, 'feedback.json');
        const feedbacks = this.readFeedback();
        const fb = feedbacks.find((f) => f.id === feedbackId);
        if (!fb) return { success: false };
        fb.helpful = (fb.helpful || 0) + 1;
        this.writeFeedback(feedbacks);
        return { success: true, helpful: fb.helpful };
    }

    // --- CONNECT ENHANCEMENT ---
    getConnects(username) {
        const user = this.findCanonicalUsername(username);
        if (!user) return [];
        const users = this.readUsers();
        const myProfile = users[user]?.collab_profile || {};
        if (!myProfile.looking) return [];
        const myRole = myProfile.role || 'vocalist';
        const myGenres = myProfile.genres || [];
        const complementaryRole = myRole === 'vocalist' ? ['producer', 'both'] : myRole === 'producer' ? ['vocalist', 'both'] : ['vocalist', 'producer'];

        return Object.entries(users)
            .filter(([name, data]) => {
                if (name === user) return false;
                const cp = data.collab_profile || {};
                if (!cp.looking) return false;
                if (!complementaryRole.includes(cp.role)) return false;
                if (myGenres.length && cp.genres.length && !cp.genres.some((g) => myGenres.includes(g))) return false;
                return true;
            })
            .map(([name, data]) => ({
                username: name,
                role: (data.collab_profile || {}).role,
                genres: (data.collab_profile || {}).genres,
                bio: (data.collab_profile || {}).bio,
                availability: (data.collab_profile || {}).availability,
                tier: data.tier || 'emerging'
            }));
    }

    addVideo({ username, bio, tags, mediaPath, song_title, producer, lyrics, collaborators, duet_of, video_filter, visibility }) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) {
            return { success: false, message: 'Invalid user.' };
        }

        const videos = this.readVideos(true);
        const bioText = String(bio || '').trim();
        const mentions = [];
        const mentionRegex = /@([A-Za-z0-9_]{3,24})/g;
        let match;
        while ((match = mentionRegex.exec(bioText)) !== null) {
            const mentioned = this.findCanonicalUsername(match[1]);
            if (mentioned && mentioned !== owner && !mentions.includes(mentioned)) {
                mentions.push(mentioned);
            }
        }

        const sanitizedSongTitle = String(song_title || '').trim().slice(0, 100);
        const sanitizedProducer = String(producer || '').trim().slice(0, 60);
        const sanitizedLyrics = String(lyrics || '').trim().slice(0, 2000);
        const vidId = createId('vid');

        const collabList = [];
        if (Array.isArray(collaborators)) {
            collaborators.slice(0, 5).forEach((c) => {
                const canonical = this.findCanonicalUsername(c);
                if (canonical && canonical !== owner && !collabList.includes(canonical)) {
                    collabList.push(canonical);
                }
            });
        }

        const video = {
            id: vidId,
            username: owner,
            verified: true,
            bio: bioText || 'New Drop',
            video: normalizeMediaPath(mediaPath),
            tags: normalizeTags(tags),
            likes: 0,
            comments: [],
            mentions,
            collaborators: collabList,
            duet_of: String(duet_of || ''),
            video_filter: String(video_filter || 'none'),
            visibility: visibility === 'vault' ? 'vault' : 'public',
            song_title: sanitizedSongTitle,
            producer: sanitizedProducer,
            original_sound_id: vidId,
            lyrics: sanitizedLyrics,
            timestamp: Date.now()
        };

        videos.push(video);
        this.writeVideos(videos);

        this.updateStreak(owner);

        mentions.forEach((mentioned) => {
            this.createNotification(mentioned, owner, 'mention', `mentioned you in a drop`, video.id);
        });

        collabList.forEach((c) => {
            this.createNotification(c, owner, 'collab', `featured you on a drop`, video.id);
        });

        return { success: true, video };
    }

    deleteVideo(videoId, username) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) {
            return { success: false, message: 'Invalid user.' };
        }

        const videos = this.readVideos(true);
        const index = videos.findIndex((video) => video.id === String(videoId));
        if (index < 0) {
            return { success: false, message: 'Video not found.' };
        }

        const video = videos[index];
        if (video.username !== owner) {
            return { success: false, message: 'Not authorized.' };
        }

        videos.splice(index, 1);
        this.writeVideos(videos);

        const social = this.readSocial();
        social.videoLikes = social.videoLikes.filter((entry) => String(entry.videoId) !== video.id);
        social.saves = social.saves.filter((entry) => String(entry.videoId) !== video.id);
        this.writeSocial(social);

        const notifications = this.readNotifications().filter(
            (notification) => notification.related_id !== video.id
        );
        this.writeNotifications(notifications);

        return {
            success: true,
            mediaPath: video.video,
            absolutePath: toAbsoluteAssetPath(this.rootDir, video.video)
        };
    }
}

module.exports = {
    JsonStore,
    avatarForUser,
    createId,
    normalizeMediaPath,
    normalizeTags,
    toAbsoluteAssetPath
};
