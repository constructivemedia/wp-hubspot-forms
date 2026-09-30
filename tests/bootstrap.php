<?php
/**
 * PHPUnit bootstrap: the few WordPress functions the plugin calls, stubbed.
 *
 * @package WpHubspotForms
 */

declare( strict_types=1 );

define( 'ABSPATH', __DIR__ );

$GLOBALS['test_filters'] = [];

function add_filter( string $hook, callable $callback ): void {
	$GLOBALS['test_filters'][ $hook ][] = $callback;
}

function apply_filters( string $hook, mixed $value, mixed ...$args ): mixed {
	foreach ( $GLOBALS['test_filters'][ $hook ] ?? [] as $callback ) {
		$value = $callback( $value, ...$args );
	}
	return $value;
}

function has_filter( string $hook ): bool {
	return ! empty( $GLOBALS['test_filters'][ $hook ] );
}

function apply_filters_deprecated( string $hook, array $args ): mixed {
	return has_filter( $hook ) ? apply_filters( $hook, ...$args ) : $args[0];
}

function do_action_deprecated(): void {}

function _deprecated_argument(): void {}

function _deprecated_hook(): void {}

function did_action(): int {
	return 0;
}

function add_action( string $hook, callable $callback ): void {}

function do_action( string $hook, mixed ...$args ): void {}

function wp_enqueue_script( string $handle ): void {}

function sanitize_html_class( string $name ): string {
	return preg_replace( "/[^A-Za-z0-9_-]/", "", $name );
}

function esc_url( string $url ): string {
	return filter_var( $url, FILTER_VALIDATE_URL ) ? $url : "";
}

function wp_kses_post( string $html ): string {
	return $html;
}

function wp_json_encode( mixed $data, int $flags = 0 ): string|false {
	return json_encode( $data, $flags );
}

function esc_attr( string $text ): string {
	return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8', false );
}

function esc_html( string $text ): string {
	return esc_attr( $text );
}

require_once dirname( __DIR__ ) . '/wp-hubspot-forms.php';
