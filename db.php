<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$host = 'localhost'; // Usually 'localhost' for cPanel/Webhost
$db   = 'tharki_rap';
$user = 'tharki_rap1';
$pass = 'HOWsmvlf1!';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    // Return standard JSON error
    echo json_encode(['error' => true, 'message' => 'Database connection failed']);
    exit;
}
?>