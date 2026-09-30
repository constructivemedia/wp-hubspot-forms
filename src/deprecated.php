<?php
/**
 * Compatibility with the Constructive Media HubSpot Forms plugin.
 *
 * Maps the old plugin's hooks, defaults, attributes and site-wide scripts onto this plugin, so
 * sites keep working while they migrate. Each old hook raises a deprecation notice (shown with
 * WP_DEBUG) only when a site uses it. Deprecated since 1.0.0, and removed in 2.0.
 *
 * The old atts filter has the same name as this plugin's, so old and new callbacks share it and
 * can't be told apart. This layer therefore runs last on that filter and applies the old plugin's
 * conversions to the result, and no notice is raised for it.
 *
 * @package ConstructiveMedia\HubSpot\Forms
 */

declare( strict_types=1 );

namespace ConstructiveMedia\HubSpot\Forms\Deprecated;

use ConstructiveMedia\HubSpot\Forms\Shortcode;

use const ConstructiveMedia\HubSpot\Forms\VERSION;

/**
 * The prefix of the old plugin's hooks.
 */
const OLD = 'constructivemedia/hubspot/forms/';

/**
 * The version that deprecated the old plugin's API.
 */
const SINCE = '1.0.0';

/**
 * The old attributes that said what to do after a submission.
 */
const ON_SUBMIT = [ 'on_submit', 'on_submit_url', 'on_submit_html', 'on_submit_delay', 'gated_url' ];

/**
 * The replacement named in notices for old hooks that renamed fields.
 */
const QUALIFIED_NAMES = 'qualified names such as 0-2/name';

/**
 * Hooks the old behaviour onto this plugin.
 *
 * @param string $plugin The main plugin file.
 */
function register( string $plugin ): void {
	add_filter( 'constructivemedia/hubspot/forms/settings', __NAMESPACE__ . '\\settings', 1 );
	add_filter( 'constructivemedia/hubspot/forms/atts', __NAMESPACE__ . '\\atts', PHP_INT_MAX );
	add_filter( 'do_shortcode_tag', __NAMESPACE__ . '\\after_render', 10, 3 );
	add_action( 'init', static fn() => scripts( $plugin ) );
	add_action( 'wp_enqueue_scripts', __NAMESPACE__ . '\\enqueue' );
}

/**
 * Runs an old filter. WordPress raises the deprecation notice only when something is hooked to it.
 *
 * @param string $name        The old hook's name, without the prefix.
 * @param array  $args        The filter's arguments.
 * @param string $replacement What to use instead, for the notice.
 * @return mixed The filtered value.
 */
function filter( string $name, array $args, string $replacement ): mixed {
	return apply_filters_deprecated( OLD . $name, $args, SINCE, $replacement );
}

/**
 * The old plugin's region: ap1, or what the old region filter returns.
 *
 * @return string The region.
 */
function region(): string {
	return (string) filter( 'region', [ 'ap1' ], 'constructivemedia/hubspot/forms/settings' );
}

/**
 * Applies the old default region (ap1) and the old portal_id and region filters. The old plugin's
 * built-in portal ID is not carried over: sites set their portal with constructivemedia/hubspot/forms/settings.
 *
 * @param array $settings The default settings.
 * @return array The settings.
 */
function settings( array $settings ): array {
	$settings['portal_id'] = filter( 'portal_id', [ $settings['portal_id'] ?? '' ], 'constructivemedia/hubspot/forms/settings' );
	$settings['region']    = region();

	return $settings;
}

/**
 * Runs a form's attributes, after every atts callback, through the old attribute pipeline: the
 * reserved_keys, form_data, v4_field_prefix, v4_field_map, wrapper_class and form_create_options
 * filters, and the before_render action.
 *
 * @param array $atts Attributes merged with the settings, as filtered.
 * @return array The settings, and the values the old pipeline produced.
 */
function atts( array $atts ): array {
	// The old plugin accepted any case and spacing, and rendered an unknown mode as legacy.
	$mode           = strtolower( trim( (string) ( $atts['mode'] ?? '' ) ) );
	$atts['mode']   = in_array( $mode, [ 'modern', 'modern-iframe' ], true ) ? $mode : 'legacy';
	$atts['region'] = strtolower( trim( (string) ( $atts['region'] ?? '' ) ) );

	$values          = form_data( $atts );
	$atts['class']   = wrapper_class( $atts );
	$atts['options'] = create_options( $atts );

	do_action_deprecated( OLD . 'before_render', [ $atts ], SINCE, 'constructivemedia/hubspot/forms/atts' );
	filtered( $atts );

	return array_intersect_key( $atts, array_flip( Shortcode::RESERVED ) ) + $values;
}

/**
 * Hands the filtered attributes from atts() to after_render(). The shortcode renders and the
 * do_shortcode_tag filter runs straight after, so one slot is enough; reading it empties it.
 *
 * @param array|null $set The attributes to keep, or null to take them.
 * @return array The attributes kept before this call.
 */
function filtered( ?array $set = null ): array {
	static $kept = [];

	$current = $kept;
	$kept    = $set ?? [];

	return $current;
}

/**
 * The values the old plugin sent to a form.
 *
 * It started from every attribute that isn't reserved, plus the site's website URL. It dropped
 * empty values, renamed fields for v4 forms, and added the form's own IDs.
 *
 * @param array $atts The form's attributes.
 * @return array Values by property name.
 */
function form_data( array $atts ): array {
	// The old reserved_keys filter received the old list. This plugin's reserved attributes, and
	// the old on_submit ones, stay reserved whatever the filter returns.
	$old_reserved = [ 'name', 'portal_id', 'form_id', 'region', 'mode', 'business_unit_id', ...ON_SUBMIT ];
	$reserved     = [
		...Shortcode::RESERVED,
		...ON_SUBMIT,
		...(array) filter( 'reserved_keys', [ $old_reserved ], 'constructivemedia/hubspot/forms/atts' ),
	];

	// get_website_entry_url() is defined by the site, when at all.
	$website = function_exists( 'get_website_entry_url' ) ? \get_website_entry_url() : null;

	$own      = array_diff_key( $atts, array_flip( $reserved ) );
	$defaults = [
		'website'     => $website,
		'website_url' => $website,
	];
	$data     = (array) filter( 'form_data', [ $own + $defaults, $atts ], 'constructivemedia/hubspot/forms/atts' );

	// The old plugin skipped these values. That still holds for the website defaults and for what
	// the old form_data filter adds or changes. Values from the attributes and the atts filter keep
	// this plugin's meaning: null clears, 0 and false are values.
	$empty = static fn( $value ) => in_array( $value, [ null, '', false, 0 ], true );
	$data  = array_filter(
		$data,
		static fn( $value, $key ) => ( array_key_exists( $key, $own ) && $own[ $key ] === $value ) || ! $empty( $value ),
		ARRAY_FILTER_USE_BOTH
	);

	// For v4 forms, the old plugin prefixed field names with an object type, contacts by default,
	// unless the field map named them. A name without a prefix matches the field on any object,
	// the contact field included, so the default prefix is left off.
	if ( 'legacy' !== $atts['mode'] ) {
		$prefix = (string) filter( 'v4_field_prefix', [ '0-1/', $atts ], QUALIFIED_NAMES );
		$map    = (array) filter( 'v4_field_map', [ [], $atts ], QUALIFIED_NAMES );
		$names  = array_map(
			static fn( $key ) => $map[ $key ] ?? ( '0-1/' === $prefix ? $key : $prefix . $key ),
			array_keys( $data )
		);
		$data   = array_combine( $names, $data );
	}

	// The old plugin filled these on contact fields only.
	foreach ( [ 'website', 'website_url' ] as $key ) {
		if ( array_key_exists( $key, $data ) ) {
			$data[ "0-1/$key" ] = $data[ $key ];
			unset( $data[ $key ] );
		}
	}

	return $data + [
		'0-1/form_id'   => $atts['form_id'] ?? '',
		'0-1/portal_id' => $atts['portal_id'] ?? '',
	];
}

/**
 * The container's classes, including the old wrapper classes that theme CSS may target.
 *
 * @param array $atts The form's attributes.
 * @return string The class attribute.
 */
function wrapper_class( array $atts ): string {
	$classes = [
		'hs-form-wrapper',
		'hs-form-' . sanitize_html_class( (string) ( $atts['name'] ?? 'default' ) ),
		'hs-form-mode-' . $atts['mode'],
	];
	$classes = (array) filter( 'wrapper_class', [ $classes, $atts ], 'the class attribute' );

	return trim( implode( ' ', $classes ) . ' ' . ( $atts['class'] ?? '' ) );
}

/**
 * The legacy form options, through the old form_create_options filter.
 *
 * @param array $atts The form's attributes.
 * @return mixed The options.
 */
function create_options( array $atts ): mixed {
	$options = (array) ( $atts['options'] ?? [] ) + [
		'portalId' => $atts['portal_id'] ?? '',
		'formId'   => $atts['form_id'] ?? '',
		'region'   => $atts['region'],
	];

	return filter( 'form_create_options', [ $options, $atts ], 'the options attribute via constructivemedia/hubspot/forms/atts' );
}

/**
 * Runs the old after_render action, and handles the old on_submit and gated_url attributes.
 *
 * What to do after a submission is added after the form as an inert <template>, which
 * assets/deprecated.js acts on. Post authors can't write <template> elements themselves.
 *
 * Uses the attributes as the atts filter left them, kept by atts(): running the filter again here
 * would run every callback twice.
 *
 * @param string       $output The shortcode's output.
 * @param string       $tag    The shortcode's tag.
 * @param array|string $atts   The shortcode's attributes.
 * @return string The output.
 */
function after_render( string $output, string $tag, array|string $atts ): string {
	if ( 'hubspot' !== $tag ) {
		return $output;
	}

	$kept = filtered();
	$atts = $kept ? $kept : ( is_array( $atts ) ? $atts : [] );
	do_action_deprecated( OLD . 'after_render', [ $atts ], SINCE, 'do_shortcode_tag' );

	$used = array_intersect_key( $atts, array_flip( ON_SUBMIT ) );
	if ( '' === $output || ( ! $used && ! has_filter( OLD . 'on_submit' ) ) ) {
		return $output;
	}
	if ( $used ) {
		$message = implode( ', ', array_keys( $used ) ) . ': use the form\'s redirect or thank-you message in HubSpot, or the constructivemedia/hubspot/forms/submitted event.';
		_deprecated_argument( '[hubspot]', esc_html( SINCE ), esc_html( $message ) );
	}

	$gated = [];
	if ( ! empty( $atts['gated_url'] ) ) {
		$gated = [
			'action' => 'html',
			'html'   => sprintf(
				'<p>Thank you for your interest.</p><a href="%s" target="_blank">Click here to download your requested information.</a>',
				esc_url( $atts['gated_url'] )
			),
		];
	}

	$then  = $gated + [
		'action' => $atts['on_submit'] ?? '',
		'url'    => $atts['on_submit_url'] ?? '',
		'html'   => $atts['on_submit_html'] ?? '',
		'delay'  => (int) ( $atts['on_submit_delay'] ?? 1 ),
	];
	$then  = (array) filter( 'on_submit', [ $then, $atts ], 'the constructivemedia/hubspot/forms/submitted event' );
	$delay = max( 0, (int) ( $then['delay'] ?? 1 ) );

	$template = match ( $then['action'] ?? '' ) {
		'redirect' => empty( $then['url'] ) ? '' : sprintf(
			'<template class="wphsf-on-submit" data-redirect="%s" data-delay="%d"></template>',
			esc_url( $then['url'] ),
			$delay
		),
		'html'     => empty( $then['html'] ) ? '' : sprintf(
			'<template class="wphsf-on-submit" data-delay="%d">%s</template>',
			$delay,
			wp_kses_post( $then['html'] )
		),
		default    => '',
	};

	return $output . $template;
}

/**
 * Registers the old script handle, which theme scripts may depend on, and the old browser API.
 *
 * @param string $plugin The main plugin file.
 */
function scripts( string $plugin ): void {
	$region = region();
	$src    = filter( 'script_url', [ "//js-{$region}.hsforms.net/forms/embed/v2.js" ], 'nothing: the plugin loads HubSpot itself' );

	wp_register_script( 'hsforms-loader', $src, [], null, false ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- HubSpot versions its own library.
	wp_register_script( 'wp-hubspot-forms-deprecated', plugins_url( 'assets/deprecated.js', $plugin ), [], VERSION, false );

	if ( has_filter( OLD . 'modern_script_url' ) ) {
		_deprecated_hook( esc_html( OLD . 'modern_script_url' ), esc_html( SINCE ), 'nothing: the plugin loads HubSpot itself' );
	}
}

/**
 * Loads HubSpot's legacy library and the old browser API on every page, as the old plugin did.
 * Theme code and forms added later, in modals or AJAX content, may rely on them being there.
 */
function enqueue(): void {
	wp_enqueue_script( 'hsforms-loader' );
	wp_enqueue_script( 'wp-hubspot-forms-deprecated' );
	wp_enqueue_script( 'wp-hubspot-forms' );
}
