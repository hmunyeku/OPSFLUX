<?php
/**
 * Adminer custom loader with auto-login plugin
 */

function adminer_object() {
    // Load plugin files
    include_once "./plugin.php";
    include_once "./login-token.php";

    // Create plugins array
    $plugins = array(
        new AdminerAutoLogin(),
    );

    // Return AdminerPlugin with our plugins
    return new AdminerPlugin($plugins);
}

// Include Adminer
include "./adminer-4.8.1.php";
