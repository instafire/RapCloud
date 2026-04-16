const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createAuthToken,
    hashPassword,
    verifyAuthToken,
    verifyPassword
} = require('../lib/auth');

test('auth tokens round-trip and reject tampering', async () => {
    const token = createAuthToken('aman', 'secret-key');
    assert.equal(verifyAuthToken(token, 'secret-key'), 'aman');
    assert.equal(verifyAuthToken(`${token}broken`, 'secret-key'), null);
});

test('password hashes verify correctly', async () => {
    const hash = await hashPassword('12345678');
    assert.equal(await verifyPassword('12345678', hash), true);
    assert.equal(await verifyPassword('bad-password', hash), false);
});
