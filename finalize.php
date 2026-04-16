<?php
// RAPR BACKEND - V23.1
// Fixed: Added error suppression to prevent JSON crashes
error_reporting(0);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=utf-8");

require 'db.php';

$filename = $_POST['filename'] ?? '';
$bio = $_POST['bio'] ?? '';
$tagsRaw = $_POST['tags'] ?? '[]';

if (!$filename) {
    echo json_encode(['success' => false, 'message' => 'No filename provided']);
    exit;
}

// 1. CONSTRUCT THE DB PATH
// The frontend sends "rap_123.mp4", but DB has "VIDEOS/rap_123.mp4"
$dbPath = "VIDEOS/" . $filename;

try {
    // 2. UPDATE THE VIDEO
    $sql = "UPDATE videos SET description = ?, tags = ? WHERE video_url = ?";
    $stmt = $pdo->prepare($sql);

    if ($stmt->execute([$bio, $tagsRaw, $dbPath])) {
        // Check if any row was actually updated
        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => true]);
        } else {
            // Fallback: Try searching just by filename (LIKE %) in case path formats differ
            $sqlFallback = "UPDATE videos SET description = ?, tags = ? WHERE video_url LIKE ?";
            $stmtFallback = $pdo->prepare($sqlFallback);
            $stmtFallback->execute([$bio, $tagsRaw, "%$filename"]);
            
            if ($stmtFallback->rowCount() > 0) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Video not found in DB']);
            }
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Database update failed']);
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Server error']);
}
?>