const bcrypt = require('bcrypt');
const crypto = require('crypto');

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,24}$/;

function normalizeUsername(value) {
    return String(value || '').trim();
}

function validateUsername(username) {
    if (!USERNAME_REGEX.test(username)) {
        return 'Use 3-24 letters, numbers, or underscores for usernames.';
    }

    return null;
}

function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
        return 'Passwords must be at least 8 characters.';
    }

    return null;
}

function normalizeHash(hash) {
    return typeof hash === 'string' && hash.startsWith('$2y$')
        ? `$2b$${hash.slice(4)}`
        : hash;
}

async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
    if (!password || !hash) {
        return false;
    }

    return bcrypt.compare(password, normalizeHash(hash));
}

function encodeBase64Url(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function createAuthToken(username, secret, ttlMs = TOKEN_TTL_MS) {
    const payload = encodeBase64Url(JSON.stringify({
        u: username,
        exp: Date.now() + ttlMs
    }));

    const signature = signPayload(payload, secret);
    return `${payload}.${signature}`;
}

function verifyAuthToken(token, secret) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
        return null;
    }

    const [payload, signature] = token.split('.');
    const expected = signPayload(payload, secret);

    if (signature !== expected) {
        return null;
    }

    try {
        const parsed = JSON.parse(decodeBase64Url(payload));
        if (!parsed.u || !parsed.exp || parsed.exp < Date.now()) {
            return null;
        }

        return normalizeUsername(parsed.u);
    } catch {
        return null;
    }
}

module.exports = {
    TOKEN_TTL_MS,
    createAuthToken,
    hashPassword,
    normalizeUsername,
    validatePassword,
    validateUsername,
    verifyAuthToken,
    verifyPassword
};
