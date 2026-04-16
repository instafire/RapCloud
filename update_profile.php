<?php
// RAPR BACKEND - V23.1
// Fixed: Added error suppression and JSON headers
error_reporting(0);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=utf-8");

require 'db.php';

$username = $_POST['username'] ?? '';
$bio = $_POST['bio'] ?? '';

if(!$username) {
    echo json_encode(['success' => false, 'message' => 'User not found']);
    exit;
}

$avatarPath = null;
if (isset($_FILES['avatar_file']) && $_FILES['avatar_file']['error'] === 0) {
    $avatarPath = 'uploads/' . time() . '_a_' . basename($_FILES['avatar_file']['name']);
    move_uploaded_file($_FILES['avatar_file']['tmp_name'], $avatarPath);
}

$headerPath = null;
if (isset($_FILES['header_file']) && $_FILES['header_file']['error'] === 0) {
    $headerPath = 'uploads/' . time() . '_h_' . basename($_FILES['header_file']['name']);
    move_uploaded_file($_FILES['header_file']['tmp_name'], $headerPath);
}

try {
    $sql = "UPDATE users SET bio = ?";
    $params = [$bio];

    if ($avatarPath) {
        $sql .= ", avatar = ?";
        $params[] = $avatarPath;
    }
    if ($headerPath) {
        $sql .= ", header = ?";
        $params[] = $headerPath;
    }

    $sql .= " WHERE username = ?";
    $params[] = $username;

    $stmt = $pdo->prepare($sql);
    if ($stmt->execute($params)) {
        // Fetch fresh data to return to frontend
        $uStmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $uStmt->execute([$username]);
        echo json_encode(['success' => true, 'data' => $uStmt->fetch(PDO::FETCH_ASSOC)]);
    } else {
        echo json_encode(['success' => false]);
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Update failed']);
}
?>