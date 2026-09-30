<?php
/**
 * The [hubspot] shortcode.
 *
 * @package ConstructiveMedia\HubSpot\Forms
 */

declare( strict_types=1 );

namespace ConstructiveMedia\HubSpot\Forms;

use InvalidArgumentException;

/**
 * Renders a HubSpot form's container:
 *
 *     [hubspot form_id="…"]
 *     [hubspot form_id="…" instance="enquiry" mode="modern" listing_id="123"]
 *
 * The container is an empty element. Its data-wphsf attribute holds the form's settings and
 * values as JSON, and assets/wp-hubspot-forms.js renders the form into it.
 *
 * Reserved attributes configure the form. Every other attribute is a value for the HubSpot
 * property of that name. Values come in three scopes, from least to most specific:
 *
 * - global:   the constructivemedia/hubspot/forms/global_values filter, for every form on the page.
 * - form:     the constructivemedia/hubspot/forms/form_values filter, for every copy of one form.
 * - instance: attributes and the constructivemedia/hubspot/forms/atts filter, for this copy only.
 *
 * Global and form values fill empty fields only. Instance values are this form's own
 * instructions, so they also replace HubSpot's defaults and prefill.
 */
final class Shortcode {

	/**
	 * Attributes that configure the form. Every other attribute is a property value.
	 */
	public const RESERVED = [ 'form_id', 'portal_id', 'region', 'mode', 'business_unit_id', 'instance', 'class', 'options' ];

	/**
	 * Default settings, passed to the constructivemedia/hubspot/forms/settings filter.
	 */
	private const DEFAULTS = [
		'portal_id' => '',
		'region'    => 'na1',
		'mode'      => 'legacy',
	];

	/**
	 * The settings sent to the browser, and the format each must have.
	 */
	private const SETTINGS = [
		'form_id'          => '/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/',
		'portal_id'        => '/^[1-9][0-9]{0,11}$/',
		'region'           => '/^[a-z]{2}[0-9]$/',
		'mode'             => '/^(?:legacy|modern|modern-iframe)$/',
		'business_unit_id' => '/^[0-9]{0,12}$/',
		'instance'         => '/^(?:[a-z][a-z0-9_-]{0,63})?$/',
	];

	/**
	 * Legacy form options that may be passed to HubSpot. Callbacks can't be sent as JSON, so the
	 * browser events replace them.
	 */
	private const OPTIONS = [ 'css', 'cssClass', 'submitButtonClass', 'errorClass', 'locale', 'translations' ];

	/**
	 * A HubSpot property name, optionally qualified with its object type, as in `0-2/name`.
	 */
	private const PROPERTY = '/^(?:[0-9]+-[0-9]+\/)?[A-Za-z][A-Za-z0-9_]{0,99}$/';

	/**
	 * Global values. The filter runs once per request.
	 *
	 * @var object|null
	 */
	private ?object $global = null;

	/**
	 * Form values by form ID. The filter runs once per form per request.
	 *
	 * @var array<string, object>
	 */
	private array $forms = [];

	/**
	 * Renders the shortcode.
	 *
	 * @param array|string $atts Shortcode attributes. WordPress passes an empty string when there are none.
	 * @return string The form's container, or an empty string when its settings are invalid.
	 */
	public function __invoke( array|string $atts ): string {
		// An empty attribute means "not set", not an empty value.
		$atts = array_filter( is_array( $atts ) ? $atts : [], static fn( $value ) => '' !== $value );

		$form_id  = strtolower( (string) ( $atts['form_id'] ?? '' ) );
		$defaults = (array) apply_filters( 'constructivemedia/hubspot/forms/settings', self::DEFAULTS, $form_id );
		$atts     = (array) apply_filters( 'constructivemedia/hubspot/forms/atts', $atts + $defaults, $form_id );

		$settings = self::settings( $atts );
		if ( null === $settings ) {
			return '';
		}
		$form_id = $settings['form_id'];

		// Post content stores & as &amp;, so string values are decoded. A null from the
		// constructivemedia/hubspot/forms/atts filter passes through: it clears the field.
		$values = array_map(
			static fn( $value ) => is_string( $value ) ? html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) : $value,
			array_diff_key( $atts, array_flip( self::RESERVED ) )
		);

		$this->global            ??= self::scope( apply_filters( 'constructivemedia/hubspot/forms/global_values', [] ) );
		$this->forms[ $form_id ] ??= self::scope( apply_filters( 'constructivemedia/hubspot/forms/form_values', [], $form_id ) );

		$data = $settings + [
			'options' => (object) array_intersect_key( (array) ( $atts['options'] ?? [] ), array_flip( self::OPTIONS ) ),
			'scopes'  => [
				'global'   => $this->global,
				'form'     => $this->forms[ $form_id ],
				'instance' => self::scope( $values ),
			],
		];

		// A form rendered after the footer scripts were printed, by a late wp_footer callback,
		// prints the script itself.
		if ( did_action( 'wp_print_footer_scripts' ) ) {
			wp_print_scripts( 'wp-hubspot-forms' );
		} else {
			wp_enqueue_script( 'wp-hubspot-forms' );
		}

		// Hex-escaping leaves nothing in the JSON for esc_attr() to change, so it arrives exactly as encoded.
		$json  = wp_json_encode( $data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		$class = trim( 'wp-hubspot-form ' . ( $atts['class'] ?? '' ) );

		return sprintf( '<div class="%s" data-wphsf="%s"></div>', esc_attr( (string) $class ), esc_attr( (string) $json ) );
	}

	/**
	 * Validates one scope's values.
	 *
	 * Invalid entries are dropped, which means "not provided". They are never turned into an
	 * empty value, because an empty value clears the field.
	 *
	 * @param mixed $values Values by property name.
	 * @return object The valid values, as an object so an empty scope encodes as {}.
	 */
	public static function scope( mixed $values ): object {
		$scope = [];

		foreach ( is_array( $values ) ? $values : [] as $key => $value ) {
			if ( ! is_string( $key ) || ! preg_match( self::PROPERTY, $key ) ) {
				self::notice( "Ignored \"$key\": not a HubSpot property name." );
				continue;
			}

			try {
				$scope[ $key ] = self::value( $value );
			} catch ( InvalidArgumentException $e ) {
				self::notice( "Ignored \"$key\": {$e->getMessage()}." );
			}
		}

		return (object) $scope;
	}

	/**
	 * Picks the settings out of the attributes and validates them.
	 *
	 * @param array $atts Attributes merged with the default settings.
	 * @return array|null The settings as strings, or null when one is invalid.
	 */
	private static function settings( array $atts ): ?array {
		$settings = array_map( 'strval', array_intersect_key( $atts, self::SETTINGS ) ) + [
			'business_unit_id' => '',
			'instance'         => '',
		];

		$settings['form_id'] = strtolower( $settings['form_id'] ?? '' );

		foreach ( self::SETTINGS as $name => $pattern ) {
			if ( ! preg_match( $pattern, $settings[ $name ] ?? '' ) ) {
				self::notice( "Invalid $name; the form was not rendered." );
				return null;
			}
		}

		return $settings;
	}

	/**
	 * Normalises one value. Values are never tested for truthiness: 0, "0" and false are values.
	 *
	 * - null clears the field, and booleans tick or untick a checkbox. Both pass through.
	 * - Numbers become strings.
	 * - Strings must be valid UTF-8.
	 * - A list holds the options to select, each a number or a string.
	 *
	 * @param mixed $value The value.
	 * @param bool  $item  Whether the value is an item in a list.
	 * @return mixed The normalised value.
	 * @throws InvalidArgumentException For a value HubSpot can't take.
	 */
	private static function value( mixed $value, bool $item = false ): mixed {
		return match ( true ) {
			null === $value && ! $item, is_bool( $value ) => $value,
			is_int( $value ), is_float( $value ) && is_finite( $value ) => (string) $value,
			is_string( $value ) && 1 === preg_match( '//u', $value ) => $value,
			is_array( $value ) && ! $item && array_is_list( $value ) => array_map( static fn( $v ) => self::value( $v, true ), $value ),
			default => throw new InvalidArgumentException( 'unsupported value' ),
		};
	}

	/**
	 * Reports a developer mistake. WordPress shows it when WP_DEBUG is on.
	 *
	 * @param string $message What went wrong.
	 */
	private static function notice( string $message ): void {
		if ( function_exists( '_doing_it_wrong' ) ) {
			_doing_it_wrong( 'WP HubSpot Forms', esc_html( $message ), esc_html( VERSION ) );
		}
	}
}
