const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    escapeHtml,
    isPublicIpv4,
    requestPublicHttp,
    resolveAuthSecret,
    safeExternalHttpUrl,
    validatePublicHttpUrl
} = require('../lib/security');

test('production requires a non-placeholder auth secret of at least 32 bytes', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapcloud-secret-'));
    try {
        assert.throws(
            () => resolveAuthSecret({ env: { NODE_ENV: 'production' }, rootDir }),
            /AUTH_SECRET/
        );
        assert.throws(
            () => resolveAuthSecret({ env: { NODE_ENV: 'production', AUTH_SECRET: 'short' }, rootDir }),
            /AUTH_SECRET/
        );
        assert.throws(
            () => resolveAuthSecret({ env: { NODE_ENV: 'production', AUTH_SECRET: 'change-this-before-production' }, rootDir }),
            /AUTH_SECRET/
        );
        const configured = 'a'.repeat(64);
        assert.equal(
            resolveAuthSecret({ env: { NODE_ENV: 'production', AUTH_SECRET: configured }, rootDir }),
            configured
        );
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('development creates a persistent private random auth secret when none is configured', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapcloud-secret-'));
    const secretPath = path.join(rootDir, '.auth-secret');
    try {
        const first = resolveAuthSecret({ env: {}, rootDir });
        const second = resolveAuthSecret({ env: {}, rootDir });
        assert.match(first, /^[A-Za-z0-9_-]{43}$/);
        assert.equal(second, first);
        assert.equal(resolveAuthSecret({ env: { AUTH_SECRET: 'development-secret-change-me' }, rootDir }), first);
        assert.equal(fs.statSync(secretPath).mode & 0o777, 0o600);
        assert.notEqual(first, 'development-secret-change-me');
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('non-public and reserved IPv4 ranges are rejected', () => {
    for (const address of [
        '0.1.2.3', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
        '172.16.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.1',
        '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255', '::1', 'not-an-ip'
    ]) {
        assert.equal(isPublicIpv4(address), false, `${address} must not be treated as public`);
    }
    assert.equal(isPublicIpv4('1.1.1.1'), true);
    assert.equal(isPublicIpv4('8.8.8.8'), true);
});

test('video imports reject loopback hostnames, IPv6 literals, credentials, and custom ports', async () => {
    await assert.rejects(validatePublicHttpUrl('http://127.0.0.1/clip.mp4'), /public IPv4/);
    await assert.rejects(validatePublicHttpUrl('http://localhost/clip.mp4'), /public IPv4/);
    await assert.rejects(validatePublicHttpUrl('http://[::1]/clip.mp4'), /public IPv4/);
    await assert.rejects(validatePublicHttpUrl('http://user:pass@8.8.8.8/clip.mp4'), /credentials/);
    await assert.rejects(validatePublicHttpUrl('http://8.8.8.8:8080/clip.mp4'), /standard/);
    await assert.rejects(validatePublicHttpUrl('file:///etc/passwd'), /HTTP and HTTPS/);
});

test('each redirect is revalidated and private targets are never fetched', async () => {
    let calls = 0;
    let responseDestroyed = false;
    const client = async (options) => {
        calls += 1;
        assert.equal(options.maxRedirects, 0);
        assert.equal(options.proxy, false);
        return {
            status: 302,
            headers: { location: 'http://127.0.0.1/admin' },
            data: { destroy: () => { responseDestroyed = true; } }
        };
    };

    await assert.rejects(
        requestPublicHttp('http://1.1.1.1/video.mp4', { client }),
        /public IPv4/
    );
    assert.equal(calls, 1);
    assert.equal(responseDestroyed, true);
});

test('profile HTML escaping and external link validation are context-safe', () => {
    assert.equal(escapeHtml('<script title="x">&\''), '&lt;script title=&quot;x&quot;&gt;&amp;&#39;');
    assert.equal(safeExternalHttpUrl('javascript:alert(1)'), null);
    assert.equal(safeExternalHttpUrl('https://example.com/path'), 'https://example.com/path');
    assert.equal(safeExternalHttpUrl('https://user:pass@example.com/'), null);
});

test('draft panel escapes persisted text and inline handler identifiers', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /escapeHtml\(d\.song_title \|\| 'No title'\)/);
    assert.match(html, /d\.tags\.map\(\(tag\) => escapeHtml\(tag\)\)/);
    assert.match(html, /const draftId = escapeHtml\(jsString\(d\.id\)\)/);
    assert.match(html, /escapeHtml\(jsString\(data\.producer\)\)/);
    assert.match(html, /escapeHtml\(jsString\(t\)\)/);
});
