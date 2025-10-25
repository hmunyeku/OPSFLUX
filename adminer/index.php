<?php
/**
 * Adminer custom loader with auto-login plugin
 */

// Define adminer_object function that will be called by Adminer
function adminer_object() {
    // At this point, Adminer class is already defined
    // Load plugin base class (sets up Adminer namespace)
    require_once "./plugin.php";

    // Load our custom plugins
    require_once "./login-token.php";

    // Create plugins array
    $plugins = array(
        new AdminerAutoLogin(),
    );

    // Return AdminerPlugin with our plugins - use fully qualified name
    return new \Adminer\AdminerPlugin($plugins);
}

// Include Adminer - it will call adminer_object() after defining the Adminer class
require "./adminer-latest.php";
