<?php
/**
 * The [hubspot] shortcode and its value rules.
 *
 * @package ConstructiveMedia\HubSpot\Forms
 */

declare( strict_types=1 );

namespace ConstructiveMedia\HubSpot\Forms\Tests;

use PHPUnit\Framework\TestCase;
use ConstructiveMedia\HubSpot\Forms\Shortcode;

final class ShortcodeTest extends TestCase {

	public const FORM = '1a2b3c4d-1111-2222-3333-444455556666';

	protected function setUp(): void {
		$GLOBALS['test_filters'] = [];
		add_filter( 'constructivemedia/hubspot/forms/settings', static fn( array $settings ) => [ 'portal_id' => '123' ] + $settings );
	}

	/**
	 * Renders the shortcode; returns the decoded container data (null when nothing rendered) and the HTML.
	 */
	public static function render( array $atts ): array {
		$html = ( new Shortcode() )( $atts );
		preg_match( '/data-wphsf="([^"]*)"/', $html, $match );
		return [ $match ? json_decode( html_entity_decode( $match[1], ENT_QUOTES, 'UTF-8' ), true ) : null, $html ];
	}

	public function test_attributes_configure_the_form_and_the_rest_are_its_values(): void {
		[ $data, $html ] = self::render( [ 'form_id' => strtoupper( self::FORM ), 'class' => 'cta', 'instance' => 'modal', 'listing_id' => 'L1', 'agent' => '' ] );

		$this->assertSame( [ self::FORM, '123', 'na1', 'legacy', 'modal' ], [ $data['form_id'], $data['portal_id'], $data['region'], $data['mode'], $data['instance'] ] );
		$this->assertSame( [ 'listing_id' => 'L1' ], $data['scopes']['instance'] ); // Empty attributes mean "not set".
		$this->assertStringStartsWith( '<div class="wp-hubspot-form cta" data-wphsf=', $html );
	}

	public function test_hooks_supply_settings_and_each_scope(): void {
		add_filter( 'constructivemedia/hubspot/forms/atts', static fn( array $atts ) => [ 'mode' => 'modern', 'listing_type' => 'package' ] + $atts );
		add_filter( 'constructivemedia/hubspot/forms/global_values', static fn( array $values ) => $values + [ 'website_url' => 'https://example.com' ] );
		add_filter( 'constructivemedia/hubspot/forms/form_values', static fn( array $values, string $form ) => self::FORM === $form ? $values + [ 'build_region' => 'North' ] : $values );

		$data = self::render( [ 'form_id' => self::FORM ] )[0];

		$this->assertSame( 'modern', $data['mode'] );
		$this->assertSame( [ 'website_url' => 'https://example.com' ], $data['scopes']['global'] );
		$this->assertSame( [ 'build_region' => 'North' ], $data['scopes']['form'] );
		$this->assertSame( [ 'listing_type' => 'package' ], $data['scopes']['instance'] );
	}

	public function test_atts_filter_null_clears(): void {
		add_filter( 'constructivemedia/hubspot/forms/atts', static fn( array $atts ) => [ 'build_region' => null ] + $atts );

		$this->assertSame( [ 'build_region' => null ], self::render( [ 'form_id' => self::FORM ] )[0]['scopes']['instance'] );
	}

	public function test_invalid_settings_render_nothing(): void {
		$this->assertSame( '', ( new Shortcode() )( [ 'form_id' => 'nope' ] ) );
		$this->assertSame( '', ( new Shortcode() )( [ 'form_id' => self::FORM, 'region' => '"><script>' ] ) );
		$this->assertSame( '', ( new Shortcode() )( [ 'form_id' => self::FORM, 'mode' => 'other' ] ) );
	}

	public function test_falsy_values_keep_their_meaning(): void {
		$scope = Shortcode::scope( [ 'zero' => 0, 'text_zero' => '0', 'no' => false, 'empty' => '', 'clear' => null, 'price' => 1.5, 'options' => [ 'a', 2 ] ] );

		$this->assertSame( [ 'zero' => '0', 'text_zero' => '0', 'no' => false, 'empty' => '', 'clear' => null, 'price' => '1.5', 'options' => [ 'a', '2' ] ], (array) $scope );
	}

	public function test_invalid_entries_are_dropped_not_cleared(): void {
		$scope = Shortcode::scope( [ 'bad key' => 'x', 0 => 'positional', 'object' => new \stdClass(), 'latin1' => "\xB1", 'nested' => [ [ 'x' ] ], 'map' => [ 'a' => 1 ] ] );

		$this->assertSame( [], (array) $scope );
	}

	public function test_values_survive_html_and_entities_exactly(): void {
		$tricky = '</script><b onmouseover="x">&amp; \'q\'';
		add_filter( 'constructivemedia/hubspot/forms/global_values', static fn() => [ 'note' => $tricky ] );

		[ $data, $html ] = self::render( [ 'form_id' => self::FORM, 'listing_type' => 'House &amp; Land' ] );

		$this->assertSame( $tricky, $data['scopes']['global']['note'] );
		$this->assertSame( 'House & Land', $data['scopes']['instance']['listing_type'] ); // Post content stores & as &amp;.
		$this->assertSame( 1, substr_count( $html, '<' ) - 1 ); // Only the closing </div>.
	}
}
