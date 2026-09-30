<?php
/**
 * Plugin Name:       WP HubSpot Forms
 * Description:       Embed HubSpot forms with [hubspot] and populate their fields by property name from PHP and JavaScript.
 * Version:           1.0.1
 * Requires at least: 6.7
 * Requires PHP:      8.1
 * Update URI:        false
 * Author:            Constructive Media
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-hubspot-forms
 *
 * @package ConstructiveMedia\HubSpot\Forms
 */

declare( strict_types=1 );

namespace ConstructiveMedia\HubSpot\Forms;

defined( 'ABSPATH' ) || exit;

/**
 * The plugin version. It also versions the plugin's scripts, so browsers fetch them afresh after an update.
 */
const VERSION = '1.0.1';

require_once __DIR__ . '/src/Shortcode.php';
require_once __DIR__ . '/src/deprecated.php';

/*
 * Registers the front-end script and the [hubspot] shortcode. The shortcode enqueues the script
 * on the pages it renders on.
 */
add_action(
	'init',
	static function (): void {
		wp_register_script(
			'wp-hubspot-forms',
			plugins_url( 'assets/wp-hubspot-forms.js', __FILE__ ),
			[],
			VERSION,
			[
				'in_footer' => true,
				'strategy'  => 'defer',
			]
		);

		add_shortcode( 'hubspot', new Shortcode() );
	}
);

/*
 * Keeps sites built on the Constructive Media HubSpot Forms plugin working: its hooks, attributes,
 * defaults and browser API. Deprecated, and removed in 2.0. Sites that don't need it turn it off
 * from a plugin or the theme's functions.php:
 *
 *     add_filter( 'constructivemedia/hubspot/forms/legacy', '__return_false' );
 */
add_action(
	'after_setup_theme',
	static function (): void {
		if ( apply_filters( 'constructivemedia/hubspot/forms/legacy', true ) ) {
			Deprecated\register( __FILE__ );
		}
	}
);
