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

test('store supports view tracking', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        const created = store.addVideo({
            username: 'aman',
            bio: 'drop',
            tags: ['rap'],
            mediaPath: '/VIDEOS/test.mp4'
        });
        assert.equal(store.getViews(created.video.id), 0);
        store.recordView('aman', created.video.id);
        store.recordView('hira', created.video.id);
        assert.equal(store.getViews(created.video.id), 2);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('store supports deleting comments', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        store.createUser('hira', 'hash');
        const created = store.addVideo({
            username: 'aman',
            bio: 'drop',
            tags: ['rap'],
            mediaPath: '/VIDEOS/test.mp4'
        });
        const comment = store.addComment('hira', created.video.id, 'hello');
        assert.equal(comment.success, true);
        assert.equal(store.listComments(created.video.id, 'hira').length, 1);
        assert.equal(store.deleteComment('hira', comment.comment.id).success, true);
        assert.equal(store.listComments(created.video.id, 'hira').length, 0);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('feed pagination works', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        for (let i = 0; i < 10; i++) {
            store.addVideo({ username: 'aman', bio: `drop ${i}`, tags: ['rap'], mediaPath: '/VIDEOS/test.mp4' });
        }
        const all = store.listFeed('aman');
        assert.equal(all.length, 10);
        const page1 = store.listFeed('aman', { limit: 3, offset: 0 });
        assert.equal(page1.length, 3);
        const page2 = store.listFeed('aman', { limit: 3, offset: 3 });
        assert.equal(page2.length, 3);
        assert.notDeepEqual(page1, page2);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('store supports drafts', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        const saved = store.saveDraft('aman', { bio: 'test draft', tags: ['rap'], song_title: 'My Track' });
        assert.equal(saved.success, true);
        assert.equal(saved.draft.bio, 'test draft');
        assert.equal(saved.draft.song_title, 'My Track');
        const drafts = store.getDrafts('aman');
        assert.equal(drafts.length, 1);
        assert.equal(store.deleteDraft(saved.draft.id, 'aman').success, true);
        assert.equal(store.getDrafts('aman').length, 0);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('store supports recommended feed', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        store.createUser('hira', 'hash');
        store.addVideo({ username: 'aman', bio: 'drop', tags: ['rap'], mediaPath: '/VIDEOS/test.mp4' });
        store.toggleFollow('hira', 'aman');
        const rec = store.listRecommended('hira', { limit: 10 });
        assert.equal(rec.length, 1);
        assert.equal(rec[0].username, 'aman');
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('store supports getChart in daily mode', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        store.addVideo({ username: 'aman', bio: 'drop', tags: ['rap'], mediaPath: '/VIDEOS/test.mp4' });
        const chart = store.getChart('daily', 'ALL CITY');
        assert.equal(chart.length, 1);
        assert.ok(chart[0].score >= 0);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('store supports blocking and feed filtering', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        store.createUser('hira', 'hash');
        store.addVideo({ username: 'aman', bio: 'drop', tags: ['rap'], mediaPath: '/VIDEOS/test.mp4' });
        assert.equal(store.listFeed('hira').length, 1);
        store.blockUser('hira', 'aman');
        assert.equal(store.listFeed('hira').length, 0);
        assert.equal(store.getBlockedUsers('hira').length, 1);
        store.unblockUser('hira', 'aman');
        assert.equal(store.listFeed('hira').length, 1);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('store supports reporting videos', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        const created = store.addVideo({ username: 'aman', bio: 'drop', tags: ['rap'], mediaPath: '/VIDEOS/test.mp4' });
        const report = store.reportVideo('aman', created.video.id, 'spam');
        assert.equal(report.success, true);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('store supports video analytics', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        const created = store.addVideo({ username: 'aman', bio: 'drop', tags: ['rap'], mediaPath: '/VIDEOS/test.mp4' });
        const analytics = store.getVideoAnalytics(created.video.id, 'aman');
        assert.ok(analytics);
        assert.equal(analytics.viewCount, 0);
        assert.equal(typeof analytics.viewsOverTime, 'object');
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('store computes momentum', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        assert.equal(store.computeMomentum('aman'), 0);
        store.addVideo({ username: 'aman', bio: 'drop', tags: ['rap'], mediaPath: '/VIDEOS/test.mp4' });
        const m = store.computeMomentum('aman');
        assert.ok(m >= 0);
        assert.ok(m <= 100);
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
});

test('store supports battles', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        store.createUser('hira', 'hash');
        const b = store.createBattle({ artist1: 'aman', artist2: 'hira' });
        assert.equal(b.success, true);
        assert.equal(store.listBattles().length, 1);
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
});

test('store supports vault visibility', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        store.createUser('hira', 'hash');
        store.addVideo({ username: 'aman', bio: 'public', tags: ['rap'], mediaPath: '/VIDEOS/test.mp4', visibility: 'public' });
        store.addVideo({ username: 'aman', bio: 'vault', tags: ['rap'], mediaPath: '/VIDEOS/test.mp4', visibility: 'vault' });
        const feed = store.listFeed('hira');
        assert.equal(feed.length, 1); // only public visible
        assert.equal(feed[0].bio, 'public');
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
});

test('store supports feedback system', () => {
    const { rootDir, store } = makeTempStore();
    try {
        store.createUser('aman', 'hash');
        store.createUser('hira', 'hash');
        const req = store.requestFeedback('vid1', 'aman');
        assert.equal(req.success, true);
        const pending = store.getPendingFeedback('hira');
        assert.equal(pending.length, 1);
        const fb = store.submitFeedback(pending[0].id, 'hira', 'good flow', 'mix needs work');
        assert.equal(fb.success, true);
        const feedbacks = store.getFeedbackForVideo('vid1');
        assert.equal(feedbacks.length, 1);
        assert.equal(feedbacks[0].what_worked, 'good flow');
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
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
