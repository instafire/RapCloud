<?php
// RAPR BACKEND - V25.6
// Fixed: Updated TikTok API implementation to tiktok-video-no-watermark2
error_reporting(0);
ini_set('display_errors', 0);

require 'db.php'; 

$target_dir = __DIR__ . "/VIDEOS/";

// --- CONFIGURATION ---
$rapid_api_key = "27c147fd31msh48400af2ee9f3b0p1a9d96jsn59263e00b1a6"; 

// 1. Instagram Host (Existing)
$insta_api_host = "instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com";

// 2. TikTok Host (NEW - tiktok-video-no-watermark2)
$tiktok_api_host = "tiktok-video-no-watermark2.p.rapidapi.com"; 

if (!file_exists($target_dir)) { mkdir($target_dir, 0755, true); }

if (isset($_POST['instaUrl']) && !empty($_POST['instaUrl'])) {
    $inputUrl = $_POST['instaUrl'];
    $username = $_POST['username'] ?? 'Anonymous'; 
    
    // 1. DETECT PLATFORM & SETUP REQUEST
    $curl = curl_init();
    $apiHost = "";
    $queryUrl = "";

    if (strpos($inputUrl, 'tiktok.com') !== false) {
        // --- TIKTOK LOGIC (Updated for tiktok-video-no-watermark2) ---
        $apiHost = $tiktok_api_host;
        // Format: GET /?url=...&hd=1
        $queryUrl = "https://" . $apiHost . "/?url=" . urlencode($inputUrl) . "&hd=1";
        
    } else {
        // --- INSTAGRAM LOGIC (Existing) ---
        $apiHost = $insta_api_host;
        $queryUrl = "https://" . $apiHost . "/convert?url=" . urlencode($inputUrl);
    }

    curl_setopt_array($curl, [
        CURLOPT_URL => $queryUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            "X-Rapidapi-Key: " . $rapid_api_key,
            "X-Rapidapi-Host: " . $apiHost
        ],
    ]);

    $response = curl_exec($curl);
    $err = curl_error($curl);
    curl_close($curl);

    if ($err) { die("Import Error: API connection failed."); }

    // 2. PARSE RESPONSE
    $data = json_decode($response, true);
    $videoDownloadUrl = "";

    // --- Response Parsing Logic ---
    
    // 1. TikTok Specific (tiktok-video-no-watermark2 format)
    if (isset($data['data']['play'])) {
        // This is the standard "no watermark" link for this API
        $videoDownloadUrl = $data['data']['play'];
    } elseif (isset($data['data']['hdplay'])) {
        // Sometimes HD links are separate
        $videoDownloadUrl = $data['data']['hdplay'];
    } 
    // 2. Instagram Specific
    elseif (isset($data['url'])) { 
        $videoDownloadUrl = $data['url']; 
    } elseif (isset($data['media'][0]['url'])) { 
        $videoDownloadUrl = $data['media'][0]['url']; 
    } 
    // 3. Fallbacks
    elseif (isset($data['data']['url'])) {
        $videoDownloadUrl = $data['data']['url'];
    } elseif (isset($data['downloadUrl'])) {
        $videoDownloadUrl = $data['downloadUrl'];
    }

    // 3. DOWNLOAD VIDEO
    if (!empty($videoDownloadUrl)) {
        $fileName = "rap_" . time() . ".mp4";
        $savePath = $target_dir . $fileName;

        $fp = fopen($savePath, 'w+');
        $ch = curl_init($videoDownloadUrl);
        curl_setopt($ch, CURLOPT_FILE, $fp);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
        // Some TikTok CDNs require a Referer
        if (strpos($inputUrl, 'tiktok.com') !== false) {
            curl_setopt($ch, CURLOPT_REFERER, "https://www.tiktok.com/");
        }
        curl_exec($ch);
        curl_close($ch);
        fclose($fp);

        if (file_exists($savePath) && filesize($savePath) > 1000) {
            
            // 4. UPDATE MYSQL DATABASE
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
            $stmt->execute([$username]);
            $userRow = $stmt->fetch();

            if ($userRow) {
                $userId = $userRow['id'];
                $dbVideoPath = "VIDEOS/" . $fileName; 

                $insertSql = "INSERT INTO videos (user_id, video_url, description, tags, likes_count) VALUES (?, ?, ?, ?, 0)";
                $pdo->prepare($insertSql)->execute([
                    $userId,
                    $dbVideoPath,
                    "New Drop", 
                    json_encode(["rap"]) 
                ]);

                // Redirect to Home with the new video ready to edit
                header("Location: index.html?new_video=" . $fileName);
                exit();
            } else {
                echo "Error: User not found. Please relogin.";
            }

        } else {
            echo "Error: Video download failed (file empty). Link might be private.";
        }
    } else {
        echo "Error: Could not find video URL in API response.";
    }
}
?>