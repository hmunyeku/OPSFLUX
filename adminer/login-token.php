<?php
/**
 * Adminer Plugin for Token-based Auto-login
 * @link https://www.adminer.org/plugins/#use
 */

class AdminerAutoLogin {
    private $serverInfo = null;

    function __construct() {
        $token = $_GET['token'] ?? null;

        if ($token) {
            $creds = $this->getCredentialsFromToken($token);

            if ($creds) {
                $this->serverInfo = $creds;

                // Set server connection parameters
                $_GET['pgsql'] = $creds['server'];
                $_GET['username'] = $creds['username'];
                $_GET['db'] = $creds['database'];

                // Auto-login immediately
                $_POST['auth'] = [
                    'driver' => 'pgsql',
                    'server' => $creds['server'],
                    'username' => $creds['username'],
                    'password' => $creds['password'],
                    'db' => $creds['database']
                ];

                error_log("Adminer: Auto-login setup completed");
            }
        }
    }

    private function getCredentialsFromToken($token) {
        $apiUrl = getenv('BACKEND_URL') ?: 'http://backend:8000';
        $endpoint = $apiUrl . '/api/v1/database/adminer-credentials';

        error_log("Adminer: Fetching credentials from $endpoint");

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
            error_log("Adminer: Failed to fetch credentials - no response");
            return null;
        }

        error_log("Adminer: Response received: " . substr($response, 0, 200));

        $data = json_decode($response, true);

        if (!$data || !isset($data['server'])) {
            error_log("Adminer: Invalid response data");
            return null;
        }

        error_log("Adminer: Successfully fetched credentials");
        return $data;
    }

    function credentials() {
        if ($this->serverInfo) {
            return [
                $this->serverInfo['server'],
                $this->serverInfo['username'],
                $this->serverInfo['password']
            ];
        }
        return null;
    }

    function database() {
        if ($this->serverInfo) {
            return $this->serverInfo['database'];
        }
        return null;
    }

    function login($login, $password) {
        if ($this->serverInfo) {
            // Verify credentials match what we got from the token
            $valid = ($login === $this->serverInfo['username'] &&
                     $password === $this->serverInfo['password']);
            error_log("Adminer: login() called - login=$login, valid=" . ($valid ? 'true' : 'false'));
            return $valid;
        }
        error_log("Adminer: login() called but no serverInfo");
        // Return null to let Adminer handle normal login
        return null;
    }

    function loginForm() {
        // No need for JavaScript - auto-login is done via $_POST in constructor
        if ($this->serverInfo) {
            echo "<!-- Auto-login via token -->";
        }
    }
}
