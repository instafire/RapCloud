<?php
error_reporting(0);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=utf-8");

require 'db.php';

$action = $_GET['action'] ?? null;
$postData = json_decode(file_get_contents('php://input'), true);

if ($postData && isset($postData['action'])) {
    $action = $postData['action'];
}

if (!$action) { echo json_encode(['error' => 'No action']); exit; }

// --- HELPERS ---
function getUserId($pdo, $username) {
    if(empty($username)) return null;
    try {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $u = $stmt->fetch(PDO::FETCH_ASSOC);
        return $u ? $u['id'] : null;
    } catch(Exception $e) { return null; }
}

function addNotification($pdo, $userId, $actorId, $type, $relatedId=null) {
    if ($userId == $actorId) return; 
    try {
        $chk = $pdo->prepare("SELECT id FROM notifications WHERE user_id=? AND actor_id=? AND type=? AND related_id=?");
        $chk->execute([$userId, $actorId, $type, $relatedId]);
        if(!$chk->fetch()) {
            $stmt = $pdo->prepare("INSERT INTO notifications (user_id, actor_id, type, related_id) VALUES (?, ?, ?, ?)");
            $stmt->execute([$userId, $actorId, $type, $relatedId]);
        }
    } catch(Exception $e) {}
}

try {
    // 1. LIKE VIDEO
    if ($action === 'like') {
        $user = $postData['username'] ?? null;
        $vidId = $postData['id'] ?? null;
        $uid = getUserId($pdo, $user);
        
        if (!$uid || !$vidId) { echo json_encode(['error' => 'Invalid']); exit; }
        
        $chk = $pdo->prepare("SELECT 1 FROM likes WHERE user_id = ? AND video_id = ?");
        $chk->execute([$uid, $vidId]);
        if(!$chk->fetch()) {
            $pdo->prepare("INSERT INTO likes (user_id, video_id) VALUES (?, ?)")->execute([$uid, $vidId]);
            $pdo->prepare("UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?")->execute([$vidId]);
            
            $vStmt = $pdo->prepare("SELECT user_id FROM videos WHERE id = ?");
            $vStmt->execute([$vidId]);
            $ownerId = $vStmt->fetchColumn();
            if($ownerId) addNotification($pdo, $ownerId, $uid, 'like', $vidId);
        }
        echo json_encode(['success' => true]);
    }

    // 2. SAVE VIDEO
    if ($action === 'save') {
        $user = $postData['username'] ?? null;
        $vidId = $postData['id'] ?? null;
        $uid = getUserId($pdo, $user);
        
        if (!$uid || !$vidId) { echo json_encode(['error' => 'Invalid']); exit; }
        
        $chk = $pdo->prepare("SELECT 1 FROM saves WHERE user_id = ? AND video_id = ?");
        $chk->execute([$uid, $vidId]);
        if($chk->fetch()) {
            $pdo->prepare("DELETE FROM saves WHERE user_id = ? AND video_id = ?")->execute([$uid, $vidId]);
            echo json_encode(['status' => 'removed']);
        } else {
            $pdo->prepare("INSERT INTO saves (user_id, video_id) VALUES (?, ?)")->execute([$uid, $vidId]);
            echo json_encode(['status' => 'added']);
        }
    }

    // 3. COMMENT
    if ($action === 'comment') {
        $user = $postData['username'] ?? null;
        $vidId = $postData['id'] ?? null;
        $text = $postData['text'] ?? '';
        $parentId = $postData['parent_id'] ?? null;
        $uid = getUserId($pdo, $user);

        if (!$uid || !$vidId || empty($text)) { echo json_encode(['error' => 'Missing data']); exit; }

        $stmt = $pdo->prepare("INSERT INTO comments (user_id, video_id, text, parent_id) VALUES (?, ?, ?, ?)");
        $stmt->execute([$uid, $vidId, $text, $parentId]);
        
        $vStmt = $pdo->prepare("SELECT user_id FROM videos WHERE id = ?");
        $vStmt->execute([$vidId]);
        $ownerId = $vStmt->fetchColumn();
        if($ownerId) addNotification($pdo, $ownerId, $uid, 'comment', $vidId);

        echo json_encode(['success' => true]);
    }

    // 4. GET COMMENTS
    if ($action === 'get_comments') {
        $vidId = $_GET['video_id'] ?? null;
        $currentUser = $_GET['user'] ?? '';
        $uid = getUserId($pdo, $currentUser);

        if (!$vidId) { echo json_encode([]); exit; }

        $sql = "SELECT c.*, u.username, u.avatar, 
                (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as likes,
                (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as has_liked
                FROM comments c 
                JOIN users u ON c.user_id = u.id 
                WHERE c.video_id = ? 
                ORDER BY c.created_at ASC";
                
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$uid, $vidId]);
        $res = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Ensure avatars
        foreach($res as &$r) {
            if(empty($r['avatar'])) $r['avatar'] = "https://ui-avatars.com/api/?name=".urlencode($r['username'])."&background=333&color=fff";
        }
        
        echo json_encode($res, JSON_INVALID_UTF8_IGNORE);
    }

    // 5. LIKE COMMENT
    if ($action === 'like_comment') {
        $cid = $postData['comment_id'] ?? null;
        $user = $postData['username'] ?? null;
        $uid = getUserId($pdo, $user);
        
        if ($uid && $cid) {
            $chk = $pdo->prepare("SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?");
            $chk->execute([$uid, $cid]);
            if(!$chk->fetch()) {
                $pdo->prepare("INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)")->execute([$uid, $cid]);
                $pdo->prepare("UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?")->execute([$cid]);
            }
        }
        echo json_encode(['success' => true]);
    }

    // 6. FOLLOW
    if ($action === 'follow') {
        $u = $postData['username'] ?? null;
        $t = $postData['target_username'] ?? null;
        $uid = getUserId($pdo, $u);
        $tid = getUserId($pdo, $t);
        
        if (!$uid || !$tid) { echo json_encode(['error' => 'Invalid users']); exit; }
        
        $chk = $pdo->prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?");
        $chk->execute([$uid, $tid]);
        
        if($chk->fetch()) {
            $pdo->prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?")->execute([$uid, $tid]);
            echo json_encode(['status' => 'unfollowed']);
        } else {
            $pdo->prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)")->execute([$uid, $tid]);
            addNotification($pdo, $tid, $uid, 'follow');
            echo json_encode(['status' => 'followed']);
        }
    }

    // 7. SEND MESSAGE
    if ($action === 'send_message') {
        $sender = $postData['sender'] ?? null;
        $receiver = $postData['receiver'] ?? null;
        $text = $postData['text'] ?? '';
        
        $sid = getUserId($pdo, $sender);
        $rid = getUserId($pdo, $receiver);
        
        if (!$sid || !$rid || empty($text)) { echo json_encode(['error' => 'Invalid']); exit; }
        
        $pdo->prepare("INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)")->execute([$sid, $rid, $text]);
        echo json_encode(['success' => true]);
    }

    // 8. GET CHATS
    if ($action === 'get_chats') {
        $user = $_GET['user'] ?? '';
        $uid = getUserId($pdo, $user);
        
        if (!$uid) { echo json_encode([]); exit; }
        
        $sql = "
            SELECT 
                m1.text as last_msg, m1.created_at,
                u1.username as sender, u2.username as receiver
            FROM messages m1
            JOIN users u1 ON m1.sender_id = u1.id
            JOIN users u2 ON m1.receiver_id = u2.id
            WHERE m1.id IN (
                SELECT MAX(id) FROM messages 
                WHERE sender_id = ? OR receiver_id = ? 
                GROUP BY CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
            )
            ORDER BY m1.created_at DESC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$uid, $uid, $uid]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_INVALID_UTF8_IGNORE);
    }

    // 9. GET MESSAGES
    if ($action === 'get_messages') {
        $u = $_GET['user'] ?? '';
        $o = $_GET['other'] ?? '';
        $uid = getUserId($pdo, $u);
        $oid = getUserId($pdo, $o);
        
        if (!$uid || !$oid) { echo json_encode([]); exit; }
        
        $stmt = $pdo->prepare("SELECT *, ? as current_user_id FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY created_at ASC");
        $stmt->execute([$uid, $uid, $oid, $oid, $uid]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_INVALID_UTF8_IGNORE);
    }

    // 10. GET NOTIFICATIONS
    if ($action === 'get_notifications') {
        $user = $_GET['user'] ?? '';
        $uid = getUserId($pdo, $user);
        
        if (!$uid) { echo json_encode([]); exit; }
        
        $sql = "SELECT n.*, u.username as actor_name, u.avatar as actor_avatar 
                FROM notifications n 
                JOIN users u ON n.actor_id = u.id 
                WHERE n.user_id = ? 
                ORDER BY n.created_at DESC LIMIT 20";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$uid]);
        $notifs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?")->execute([$uid]);
        echo json_encode($notifs, JSON_INVALID_UTF8_IGNORE);
    }

    // 11. SEARCH
    if ($action === 'search_users') {
        $q = $_GET['query'] ?? '';
        if(empty($q)) { echo json_encode([]); exit; }
        $qParam = $q . '%';
        $stmt = $pdo->prepare("SELECT username, avatar, bio FROM users WHERE username LIKE ? LIMIT 10");
        $stmt->execute([$qParam]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_INVALID_UTF8_IGNORE);
    }

    // 12. GET FOLLOWERS
    if ($action === 'get_followers') {
        $user = $_GET['target'] ?? '';
        $uid = getUserId($pdo, $user);
        if(!$uid) { echo json_encode([]); exit; }
        $stmt = $pdo->prepare("SELECT u.username, u.avatar, u.bio FROM follows f JOIN users u ON f.follower_id = u.id WHERE f.following_id = ?");
        $stmt->execute([$uid]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_INVALID_UTF8_IGNORE);
    }

    // 13. GET FOLLOWING
    if ($action === 'get_following') {
        $user = $_GET['target'] ?? '';
        $uid = getUserId($pdo, $user);
        if(!$uid) { echo json_encode([]); exit; }
        $stmt = $pdo->prepare("SELECT u.username, u.avatar, u.bio FROM follows f JOIN users u ON f.following_id = u.id WHERE f.follower_id = ?");
        $stmt->execute([$uid]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_INVALID_UTF8_IGNORE);
    }

} catch (Exception $e) {
    echo json_encode(['error' => 'Server error']);
}
// 14. DELETE VIDEO
if ($action === 'delete_video') {
    $vidId = $postData['id'] ?? null;
    $user = $postData['username'] ?? null;
    $uid = getUserId($pdo, $user);

    if (!$uid || !$vidId) { echo json_encode(['error' => 'Invalid data']); exit; }

    // 1. Verify ownership
    $stmt = $pdo->prepare("SELECT video_url, user_id FROM videos WHERE id = ?");
    $stmt->execute([$vidId]);
    $video = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($video && $video['user_id'] == $uid) {
        // 2. Delete the actual file from the folder
        if (file_exists($video['video_url'])) {
            unlink($video['video_url']);
        }
        
        // 3. Delete from Database
        $pdo->prepare("DELETE FROM videos WHERE id = ?")->execute([$vidId]);
        
        // 4. Clean up notifications related to this video
        $pdo->prepare("DELETE FROM notifications WHERE related_id = ?")->execute([$vidId]);

        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['error' => 'Not authorized']);
    }
}
?>