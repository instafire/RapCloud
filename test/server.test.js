const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildApp } = require('../server');
const { JsonStore } = require('../lib/store');

test('server routes support the core publishing and social flows', async (t) => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapr-server-'));
    const store = new JsonStore(rootDir);
    const app = buildApp({ store });
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const createdFiles = [];
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    t.after(() => {
        server.close();
        createdFiles.forEach((filePath) => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch {
            }
        });
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    async function request(url, options = {}) {
        const response = await fetch(`${baseUrl}${url}`, options);
        const text = await response.text();

        try {
            return {
                response,
                data: text ? JSON.parse(text) : null
            };
        } catch {
            return {
                response,
                data: text
            };
        }
    }

    let result = await request('/api/health');
    assert.equal(result.response.status, 200);
    assert.equal(result.data.ok, true);

    result = await request('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'register',
            username: 'artist1',
            password: 'ship-ready'
        })
    });
    assert.equal(result.response.status, 200);
    const artistToken = result.data.token;

    const publishForm = new FormData();
    publishForm.set('bio', 'Ship Ready Drop');
    publishForm.set('tags', JSON.stringify(['plugg', 'jerk']));
    publishForm.set('video_file', new Blob(['fake mp4 payload'], { type: 'video/mp4' }), 'drop.mp4');

    result = await request('/api/finalize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${artistToken}` },
        body: publishForm
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.success, true);

    const createdVideo = result.data.video;
    const videoPath = path.join(__dirname, '..', createdVideo.video.replace(/^\/+/, '').replace(/\//g, path.sep));
    createdFiles.push(videoPath);

    result = await request('/api/feed?user=artist1');
    assert.equal(result.response.status, 200);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].bio, 'Ship Ready Drop');
    assert.deepEqual(result.data[0].tags, ['plugg', 'jerk']);

    result = await request('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'register',
            username: 'fan1',
            password: 'ship-ready'
        })
    });
    assert.equal(result.response.status, 200);
    const fanToken = result.data.token;

    result = await request('/api/interact', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${fanToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            action: 'follow',
            target_username: 'artist1'
        })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.is_following, true);

    result = await request('/api/interact', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${fanToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            action: 'comment',
            id: createdVideo.id,
            text: 'fire'
        })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.success, true);
    const commentId = result.data.comment.id;

    result = await request('/api/interact?action=get_comments&video_id=' + encodeURIComponent(createdVideo.id), {
        headers: { Authorization: `Bearer ${artistToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].id, commentId);

    result = await request('/api/interact', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${artistToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            action: 'like_comment',
            comment_id: commentId
        })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.success, true);

    result = await request('/api/interact', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${fanToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            action: 'send_message',
            receiver: 'artist1',
            text: 'yo'
        })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.success, true);

    result = await request('/api/interact?action=get_chats', {
        headers: { Authorization: `Bearer ${artistToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.length, 1);

    result = await request('/api/interact?action=get_messages&other=fan1', {
        headers: { Authorization: `Bearer ${artistToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].text, 'yo');

    result = await request('/api/interact?action=get_notifications', {
        headers: { Authorization: `Bearer ${artistToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.data.some((entry) => entry.type === 'follow'));
    assert.ok(result.data.some((entry) => entry.type === 'comment'));
    assert.ok(result.data.some((entry) => entry.type === 'message'));

    const profileForm = new FormData();
    profileForm.set('bio', 'Updated bio');
    profileForm.set('avatar_file', new Blob(['avatar bytes'], { type: 'image/png' }), 'avatar.png');

    result = await request('/api/profile/update', {
        method: 'POST',
        headers: { Authorization: `Bearer ${artistToken}` },
        body: profileForm
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.success, true);
    assert.equal(result.data.data.bio, 'Updated bio');
    assert.match(result.data.data.avatar, /^\/uploads\//);

    const avatarPath = path.join(__dirname, '..', result.data.data.avatar.replace(/^\/+/, '').replace(/\//g, path.sep));
    createdFiles.push(avatarPath);

    result = await request('/api/interact?action=get_followers&target=artist1', {
        headers: { Authorization: `Bearer ${artistToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].username, 'fan1');

    result = await request('/api/interact', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${artistToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            action: 'delete_video',
            id: createdVideo.id
        })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.success, true);
});
