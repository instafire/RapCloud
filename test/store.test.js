const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { JsonStore } = require('../lib/store');

function makeTempStore() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapr-store-'));
    const store = new JsonStore(rootDir);
    return { rootDir, store };
}

test('store can create users and videos', () => {
    const { rootDir, store } = makeTempStore();

    try {
        store.createUser('aman', 'hash');
        const created = store.addVideo({
            username: 'aman',
            bio: 'first drop',
            tags: ['jerk'],
            mediaPath: '/VIDEOS/test.mp4'
        });

        assert.equal(created.success, true);
        const feed = store.listFeed('aman');
        assert.equal(feed.length, 1);
        assert.equal(feed[0].username, 'aman');
        assert.deepEqual(feed[0].tags, ['jerk']);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('store tracks follows, saves, comments, and messages', () => {
    const { rootDir, store } = makeTempStore();

    try {
        store.createUser('aman', 'hash');
        store.createUser('hira', 'hash');
        const created = store.addVideo({
            username: 'aman',
            bio: 'new drop',
            tags: ['plugg'],
            mediaPath: '/VIDEOS/test.mp4'
        });

        assert.equal(store.toggleFollow('hira', 'aman').is_following, true);
        assert.equal(store.toggleSave('hira', created.video.id).status, 'added');
        assert.equal(store.addComment('hira', created.video.id, 'fire').success, true);
        assert.equal(store.sendMessage('hira', 'aman', 'yo').success, true);

        assert.equal(store.listFollowers('aman').length, 1);
        assert.equal(store.listComments(created.video.id, 'hira').length, 1);
        assert.equal(store.listChats('aman').length, 1);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});
