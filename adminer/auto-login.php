<?php
/**
 * Auto-login redirect page for Adminer
 * This page receives the token and submits a POST request to Adminer
 */

$token = $_GET['token'] ?? null;

if (!$token) {
    die('Token manquant');
}

// Fetch credentials from backend API
$apiUrl = getenv('BACKEND_URL') ?: 'http://backend:8000';
$endpoint = $apiUrl . '/api/v1/database/adminer-credentials';

$context = stream_context_create([
    'http' => [
        'method' => 'GET',
        'header' => "Authorization: Bearer " . $token . "\r\n" .
                   "Content-Type: application/json\r\n",
        'timeout' => 5,
        'ignore_errors' => true
    ]
]);

$response = file_get_contents($endpoint, false, $context);

if ($response === false) {
    die('Erreur lors de la récupération des credentials');
}

$creds = json_decode($response, true);

if (!$creds || !isset($creds['server'])) {
    die('Credentials invalides');
}
?>
<!DOCTYPE html>
<html>
<head>
    <title>Connexion à Adminer...</title>
</head>
<body>
    <p>Connexion en cours...</p>
    <form id="loginForm" action="/" method="POST">
        <input type="hidden" name="auth[driver]" value="pgsql">
        <input type="hidden" name="auth[server]" value="<?php echo htmlspecialchars($creds['server']); ?>">
        <input type="hidden" name="auth[username]" value="<?php echo htmlspecialchars($creds['username']); ?>">
        <input type="hidden" name="auth[password]" value="<?php echo htmlspecialchars($creds['password']); ?>">
        <input type="hidden" name="auth[db]" value="<?php echo htmlspecialchars($creds['database']); ?>">
    </form>
    <script>
        document.getElementById('loginForm').submit();
    </script>
</body>
</html>
