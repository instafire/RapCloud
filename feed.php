<?php
// RAPR BACKEND - V25.3
// Fixed: Now fetches comment count for the feed
error_reporting(0);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=utf-8");

require 'db.php';

$currentUser = $_GET['user'] ?? null;
$currentUserId = null;
$userLikedVideoIds = [];

// 2. Get Current User Info
if($currentUser) {
    try {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$currentUser]);
        $u = $stmt->fetch(PDO::FETCH_ASSOC);
        if($u) {
            $currentUserId = $u['id'];
            // Get liked videos
            $lStmt = $pdo->prepare("SELECT video_id FROM likes WHERE user_id = ?");
            $lStmt->execute([$currentUserId]);
            $userLikedVideoIds = $lStmt->fetchAll(PDO::FETCH_COLUMN);
        }
    } catch (Exception $e) {
        // Silently fail auth
    }
}

// 3. Fetch Videos + Comment Count (Subquery added)
$sql = "SELECT v.*, u.username, u.avatar, u.bio as user_bio, u.header,
        (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count
        FROM videos v 
        LEFT JOIN users u ON v.user_id = u.id 
        ORDER BY v.id DESC LIMIT 50";

try {
    $stmt = $pdo->query($sql);
    $allVideos = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    echo json_encode([]);
    exit;
}

$output = [];

foreach ($allVideos as $video) {
    if(empty($video['video_url'])) continue;

    $vidId = $video['id'];
    
    // Check Interactions
    $isLiked = false;
    $isSaved = false;
    if ($currentUserId) {
        if (in_array($vidId, $userLikedVideoIds)) $isLiked = true;

        $sCheck = $pdo->prepare("SELECT 1 FROM saves WHERE user_id = ? AND video_id = ?");
        $sCheck->execute([$currentUserId, $vidId]);
        if($sCheck->fetch()) $isSaved = true;
    }

    // Prepare Tags
    $tagsRaw = $video['tags'] ?? '[]';
    $tags = json_decode($tagsRaw, true);
    if (!is_array($tags)) $tags = ['rap'];

    // Safe Username & Avatar
    $username = !empty($video['username']) ? $video['username'] : 'Unknown';
    $avatar = !empty($video['avatar']) ? $video['avatar'] : "https://ui-avatars.com/api/?name=".urlencode($username)."&background=000&color=fff";

    $output[] = [
        'id' => $vidId,
        'video' => $video['video_url'],
        'username' => $username,
        'bio' => $video['description'] ?? ($video['user_bio'] ?? 'New Drop'),
        'avatar' => $avatar,
        'header' => $video['header'] ?? '',
        'likes' => (int)($video['likes_count'] ?? 0),
        'comments_count' => (int)($video['comments_count'] ?? 0), // Sending count
        'tags' => $tags,
        'comments' => [], // Still empty to save bandwidth
        'has_liked' => $isLiked,
        'has_saved' => $isSaved,
        'timestamp' => $video['created_at'] ?? date('Y-m-d H:i:s')
    ];
}

echo json_encode($output, JSON_INVALID_UTF8_IGNORE);
?>