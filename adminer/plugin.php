<?php
/** Adminer plugin base class */

// Use the Adminer namespace
namespace Adminer;

class AdminerPlugin extends Adminer {
	var $plugins;

	function _findRootClass($class) {
		do {
			$return = $class;
		} while ($class = get_parent_class($class));
		return $return;
	}

	function __construct($plugins) {
		$this->plugins = $plugins;
	}

	function __call($name, $args) {
		foreach ($this->plugins as $plugin) {
			if (method_exists($plugin, $name)) {
				$return = call_user_func_array(array($plugin, $name), $args);
				if ($return !== null) {
					return $return;
				}
			}
		}
		return parent::__call($name, $args);
	}
}
