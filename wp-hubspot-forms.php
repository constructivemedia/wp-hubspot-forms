<?php
/**
 * Plugin Name:       WP HubSpot Forms
 * Description:       Embed HubSpot forms with [hubspot] and populate their fields by property name from PHP and JavaScript.
 * Version:           1.1.0
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
const VERSION = '1.1.0';

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
 * Remembers how each visitor arrived, and fills the HubSpot properties the site maps to that on
 * every form:
 *
 *     add_filter( 'constructivemedia/hubspot/forms/entry', static fn( array $map ): array => $map + [ 'utm_source' => 'utm_source', 'landing_page' => 'url' ] );
 *
 * assets/entry.js does both in the visitor's browser, on every page, so a cached page is the same
 * for everyone: the page carries only the map. Without a map, nothing is loaded.
 */
add_action(
	'wp_footer',
	static function (): void {
		$map = array_filter( (array) Shortcode::scope( apply_filters( 'constructivemedia/hubspot/forms/entry', [] ) ), 'is_string' );
		if ( ! $map ) {
			return;
		}

		$tag = [
			'type' => 'application/json',
			'id'   => 'wp-hubspot-forms-entry',
		];
		wp_print_inline_script_tag( (string) wp_json_encode( $map, JSON_HEX_TAG | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ), $tag );

		wp_enqueue_script(
			'wp-hubspot-forms-entry',
			plugins_url( 'assets/entry.js', __FILE__ ),
			[],
			VERSION,
			[
				'in_footer' => true,
				'strategy'  => 'defer',
			]
		);
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
