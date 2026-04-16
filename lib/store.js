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
            notifications: path.join(rootDir, 'notifications.json')
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
                commentLikes: []
            },
            messages: [],
            notifications: []
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
                created_at: data.created_at || Date.now()
            };
        });

        return normalized;
    }

    writeUsers(users) {
        writeJson(this.files.users, users);
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
            commentLikes: Array.isArray(social.commentLikes) ? social.commentLikes : []
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
            created_at: Date.now()
        };
        this.writeUsers(users);

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
        notifications.push({
            id: createId('ntf'),
            user_to: userTo,
            user_from: userFrom,
            type,
            message,
            related_id: relatedId ? String(relatedId) : null,
            is_read: 0,
            created_at: new Date().toISOString()
        });
        this.writeNotifications(notifications);
    }

    listFeed(viewerUsername) {
        const users = this.readUsers();
        const videos = this.readVideos();
        const social = this.readSocial();
        const viewer = this.findCanonicalUsername(viewerUsername);

        return videos.map((video) => {
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
                tags: normalizeTags(video.tags),
                comments: [],
                has_liked: hasLiked,
                has_saved: hasSaved,
                verified: video.verified !== false,
                timestamp: video.timestamp
            };
        });
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

        return {
            username: target.username,
            bio: target.bio || 'New Artist',
            avatar: avatarForUser(target.username, target.avatar),
            header: target.header || '',
            followers_count: followersCount,
            following_count: followingCount,
            is_following: isFollowing
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

    addVideo({ username, bio, tags, mediaPath }) {
        const owner = this.findCanonicalUsername(username);
        if (!owner) {
            return { success: false, message: 'Invalid user.' };
        }

        const videos = this.readVideos(true);
        const video = {
            id: createId('vid'),
            username: owner,
            verified: true,
            bio: String(bio || 'New Drop').trim() || 'New Drop',
            video: normalizeMediaPath(mediaPath),
            tags: normalizeTags(tags),
            likes: 0,
            comments: [],
            timestamp: Date.now()
        };

        videos.push(video);
        this.writeVideos(videos);
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
