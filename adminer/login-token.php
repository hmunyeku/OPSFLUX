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
            }
        }
    }

    private function getCredentialsFromToken($token) {
        $apiUrl = getenv('BACKEND_URL') ?: 'http://backend:8000';
        $endpoint = $apiUrl . '/api/v1/database/adminer-credentials';

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Authorization: Bearer " . $token . "\r\n" .
                           "Content-Type: application/json\r\n",
                'timeout' => 5
            ]
        ]);

        $response = @file_get_contents($endpoint, false, $context);

        if ($response === false) {
            return null;
        }

        $data = json_decode($response, true);

        if (!$data || !isset($data['server'])) {
            return null;
        }

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
            return ($login === $this->serverInfo['username'] &&
                    $password === $this->serverInfo['password']);
        }
        return null;
    }

    function loginForm() {
        if ($this->serverInfo) {
            // Auto-fill and submit the login form
            ?>
            <script>
            window.addEventListener('load', function() {
                var form = document.querySelector('form');
                if (form) {
                    var inputs = form.querySelectorAll('input');
                    for (var i = 0; i < inputs.length; i++) {
                        var input = inputs[i];
                        var name = input.getAttribute('name');

                        if (name === 'auth[server]') {
                            input.value = '<?php echo addslashes($this->serverInfo['server']); ?>';
                        } else if (name === 'auth[username]') {
                            input.value = '<?php echo addslashes($this->serverInfo['username']); ?>';
                        } else if (name === 'auth[password]') {
                            input.value = '<?php echo addslashes($this->serverInfo['password']); ?>';
                        } else if (name === 'auth[db]') {
                            input.value = '<?php echo addslashes($this->serverInfo['database']); ?>';
                        }
                    }

                    // Auto-submit the form
                    setTimeout(function() {
                        form.submit();
                    }, 300);
                }
            });
            </script>
            <?php
        }
    }
}
