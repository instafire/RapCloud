const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const axios = require('axios');

const BLOCKED_IPV4_RANGES = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4]
];

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PLACEHOLDER_SECRETS = new Set([
    'change-this-before-production',
    'your-custom-hmac-secret',
    'development-secret-change-me'
]);

function ipv4ToNumber(address) {
    if (net.isIP(address) !== 4) return null;
    return address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
}

function isPublicIpv4(address) {
    const number = ipv4ToNumber(address);
    if (number === null) return false;

    return !BLOCKED_IPV4_RANGES.some(([network, prefix]) => {
        const blockSize = 2 ** (32 - prefix);
        return Math.floor(number / blockSize) === Math.floor(ipv4ToNumber(network) / blockSize);
    });
}

function resolveAuthSecret({ env = process.env, rootDir = process.cwd() } = {}) {
    const configured = typeof env.AUTH_SECRET === 'string' ? env.AUTH_SECRET.trim() : '';
    const isPlaceholder = PLACEHOLDER_SECRETS.has(configured.toLowerCase());

    if (env.NODE_ENV === 'production') {
        if (!configured || isPlaceholder || Buffer.byteLength(configured, 'utf8') < 32) {
            throw new Error('Production requires AUTH_SECRET to be set to a non-placeholder value of at least 32 bytes.');
        }
        return configured;
    }

    if (configured && !isPlaceholder) return configured;

    const secretPath = path.join(rootDir, '.auth-secret');
    const readLocalSecret = () => {
        const secret = fs.readFileSync(secretPath, 'utf8').trim();
        if (Buffer.byteLength(secret, 'utf8') < 32) {
            throw new Error('The local .auth-secret is invalid; set AUTH_SECRET or replace the file.');
        }
        try {
            fs.chmodSync(secretPath, 0o600);
        } catch {
            // Best effort on filesystems that do not support POSIX permissions.
        }
        return secret;
    };

    try {
        return readLocalSecret();
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    const generated = crypto.randomBytes(32).toString('base64url');
    let fileDescriptor;
    try {
        fileDescriptor = fs.openSync(secretPath, 'wx', 0o600);
        fs.writeFileSync(fileDescriptor, `${generated}\n`, 'utf8');
        fs.fsyncSync(fileDescriptor);
        return generated;
    } catch (error) {
        if (error.code === 'EEXIST') return readLocalSecret();
        throw error;
    } finally {
        if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
    }
}

async function validatePublicHttpUrl(input) {
    let url;
    try {
        url = input instanceof URL ? new URL(input.href) : new URL(String(input || '').trim());
    } catch {
        throw new Error('Enter a valid public video URL.');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only public HTTP and HTTPS video URLs are supported.');
    }
    if (!url.hostname || url.username || url.password) {
        throw new Error('Video URLs must not contain credentials.');
    }
    if (url.port) {
        throw new Error('Video URLs must use the standard HTTP or HTTPS port.');
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const family = net.isIP(hostname);
    if (family === 6) {
        throw new Error('Video URLs must resolve to a public IPv4 address.');
    }

    let addresses;
    if (family === 4) {
        addresses = [hostname];
    } else {
        try {
            const records = await dns.lookup(hostname, { all: true, family: 4, verbatim: true });
            addresses = records.map((record) => record.address);
        } catch {
            throw new Error('Video URLs must resolve to a public IPv4 address.');
        }
    }

    if (!addresses.length || addresses.some((address) => !isPublicIpv4(address))) {
        throw new Error('Video URLs must resolve only to public IPv4 addresses.');
    }

    url.hash = '';
    return { url, hostname, address: addresses[0] };
}

function createPinnedLookup(expectedHostname, address) {
    return (requestedHostname, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        const hostname = String(requestedHostname || '').replace(/^\[|\]$/g, '').toLowerCase();
        if (hostname !== expectedHostname) {
            const error = new Error('Unexpected host in video request.');
            error.code = 'ENOTFOUND';
            return callback(error);
        }

        const record = { address, family: 4 };
        if (options?.all) return callback(null, [record]);
        return callback(null, record.address, record.family);
    };
}

async function requestPublicHttp(input, { client = axios, maxRedirects = 5, timeout = 30000 } = {}) {
    let currentUrl = input;

    for (let redirectCount = 0; ; redirectCount += 1) {
        const target = await validatePublicHttpUrl(currentUrl);
        const lookup = createPinnedLookup(target.hostname, target.address);
        const requestOptions = {
            method: 'GET',
            url: target.url.toString(),
            responseType: 'stream',
            maxRedirects: 0,
            timeout,
            proxy: false,
            httpAgent: new http.Agent({ lookup }),
            httpsAgent: new https.Agent({ lookup }),
            validateStatus: (status) => status >= 200 && status < 400
        };

        let response;
        try {
            response = await client(requestOptions);
        } catch {
            throw new Error('Could not download from that public video URL.');
        }

        if (REDIRECT_STATUSES.has(Number(response.status))) {
            response.data?.destroy?.();
            if (redirectCount >= maxRedirects) {
                throw new Error('The video URL returned too many redirects.');
            }

            const location = response.headers?.location;
            if (typeof location !== 'string' || !location.trim()) {
                throw new Error('The video URL returned an invalid redirect.');
            }
            try {
                currentUrl = new URL(location, target.url);
            } catch {
                throw new Error('The video URL returned an invalid redirect.');
            }
            continue;
        }

        if (Number(response.status) < 200 || Number(response.status) >= 300) {
            response.data?.destroy?.();
            throw new Error('The video source did not return a successful response.');
        }

        return { response, url: target.url };
    }
}

function escapeHtml(value) {
    const replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(value ?? '').replace(/[&<>"']/g, (character) => replacements[character]);
}

function safeExternalHttpUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
            return null;
        }
        return url.href;
    } catch {
        return null;
    }
}

module.exports = {
    createPinnedLookup,
    escapeHtml,
    isPublicIpv4,
    requestPublicHttp,
    resolveAuthSecret,
    safeExternalHttpUrl,
    validatePublicHttpUrl
};
