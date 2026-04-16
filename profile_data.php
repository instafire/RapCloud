<?php
error_reporting(0);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=utf-8");

require 'db.php';

$targetUser = $_GET['user'] ?? '';
$viewerUser = $_GET['viewer'] ?? '';

// Return Ghost profile immediately if no user provided
if (!$targetUser) { 
    echo json_encode([
        'username' => 'Unknown',
        'bio' => 'User not found.',
        'avatar' => "https://ui-avatars.com/api/?name=Unknown&background=000&color=fff",
        'header' => '',
        'followers_count' => 0,
        'following_count' => 0,
        'is_following' => false
    ]);
    exit; 
}

try {
    // 1. Get Target Data
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$targetUser]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        // Fallback for non-existent users (e.g. deleted but still on feed)
        echo json_encode([
            'username' => $targetUser,
            'bio' => 'User not found.',
            'avatar' => "https://ui-avatars.com/api/?name=".urlencode($targetUser)."&background=000&color=fff",
            'header' => '',
            'followers_count' => 0,
            'following_count' => 0,
            'is_following' => false
        ]);
        exit;
    }

    $tid = $user['id'];

    // 2. Get Counts
    $fStmt = $pdo->prepare("SELECT COUNT(*) FROM follows WHERE following_id = ?");
    $fStmt->execute([$tid]);
    $fCount = $fStmt->fetchColumn();

    $fingStmt = $pdo->prepare("SELECT COUNT(*) FROM follows WHERE follower_id = ?");
    $fingStmt->execute([$tid]);
    $fingCount = $fingStmt->fetchColumn();

    // 3. Check Status
    $isFollowing = false;
    if ($viewerUser) {
        $vStmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
        $vStmt->execute([$viewerUser]);
        $viewerData = $vStmt->fetch(PDO::FETCH_ASSOC);
        
        if ($viewerData) {
            $vid = $viewerData['id'];
            $chk = $pdo->prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?");
            $chk->execute([$vid, $tid]);
            if($chk->fetch()) $isFollowing = true;
        }
    }
    
    // Ensure Avatar is not empty string
    $avatar = !empty($user['avatar']) ? $user['avatar'] : "https://ui-avatars.com/api/?name=".urlencode($user['username'])."&background=000&color=fff";

    // 4. Return Data
    echo json_encode([
        'username' => $user['username'],
        'bio' => $user['bio'] ?? "New Artist",
        'avatar' => $avatar,
        'header' => $user['header'] ?? '',
        'followers_count' => (int)$fCount,
        'following_count' => (int)$fingCount,
        'is_following' => $isFollowing
    ], JSON_INVALID_UTF8_IGNORE);

} catch (Exception $e) {
    echo json_encode(['error' => true]);
}
?>