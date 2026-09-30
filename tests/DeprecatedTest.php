<?php
/**
 * The old plugin's hooks, defaults and attributes still work.
 *
 * @package ConstructiveMedia\HubSpot\Forms
 */

declare( strict_types=1 );

namespace ConstructiveMedia\HubSpot\Forms\Tests;

use PHPUnit\Framework\TestCase;
use ConstructiveMedia\HubSpot\Forms\Shortcode;

use function ConstructiveMedia\HubSpot\Forms\Deprecated\register;

final class DeprecatedTest extends TestCase {

	private const FORM = '1a2b3c4d-1111-2222-3333-444455556666';
	private const OLD  = 'constructivemedia/hubspot/forms/';

	protected function setUp(): void {
		$GLOBALS['test_filters'] = [];
		register( 'wp-hubspot-forms.php' );
		add_filter( 'constructivemedia/hubspot/forms/settings', static fn( array $settings ) => [ 'portal_id' => '123' ] + $settings );
	}

	public function test_old_region_default_and_portal_filter_but_no_built_in_portal(): void {
		$GLOBALS['test_filters'] = [];
		register( 'wp-hubspot-forms.php' );
		$this->assertSame( '', ( new Shortcode() )( [ 'form_id' => self::FORM ] ), 'Without a portal, nothing renders.' );

		add_filter( self::OLD . 'portal_id', static fn() => 999 );
		$this->assertSame( [ '999', 'ap1' ], array_values( array_intersect_key( ShortcodeTest::render( [ 'form_id' => self::FORM ] )[0], [ 'portal_id' => 1, 'region' => 1 ] ) ) );

		$this->setUp();
		add_filter( self::OLD . 'portal_id', static fn() => 999 );
		$this->assertSame( '123', ShortcodeTest::render( [ 'form_id' => self::FORM ] )[0]['portal_id'], 'The new settings filter wins over the old one.' );
	}

	public function test_form_data_snippet_from_existing_sites(): void {
		add_filter(
			self::OLD . 'form_data',
			static function ( array $data ) {
				if ( empty( $data['agency_id'] ) ) {
					$data['agency_id'] = 'example-agency';
				}
				return $data;
			}
		);

		$instance = ShortcodeTest::render( [ 'form_id' => self::FORM, 'listing_id' => 'L1' ] )[0]['scopes']['instance'];

		$this->assertSame( [ 'listing_id' => 'L1', 'agency_id' => 'example-agency', '0-1/form_id' => self::FORM, '0-1/portal_id' => '123' ], $instance );
	}

	public function test_old_tolerant_mode_and_falsy_skipping(): void {
		add_filter( self::OLD . 'form_data', static fn( array $data ) => $data + [ 'listing_url' => false, 'count' => 0, 'zero' => '0' ] );

		[ $data ] = ShortcodeTest::render( [ 'form_id' => self::FORM, 'mode' => ' Modern ', 'region' => 'AP1' ] );

		$this->assertSame( [ 'modern', 'ap1' ], [ $data['mode'], $data['region'] ] );
		$this->assertSame( 'legacy', ShortcodeTest::render( [ 'form_id' => self::FORM, 'mode' => 'v2' ] )[0]['mode'] );
		$this->assertSame( [ 'zero' => '0' ], array_intersect_key( $data['scopes']['instance'], [ 'listing_url' => 1, 'count' => 1, 'zero' => 1 ] ) );
	}

	public function test_atts_callbacks_go_through_the_old_pipeline_once(): void {
		$calls = 0;
		add_filter(
			'constructivemedia/hubspot/forms/atts',
			static function ( array $atts ) use ( &$calls ): array {
				++$calls;
				return [ 'mode' => ' Modern ' ] + $atts + [ 'listing_url' => false, 'note' => '', 'listing_id' => 'L1' ];
			}
		);

		[ $data, $html ] = ShortcodeTest::render( [ 'form_id' => self::FORM ] );
		apply_filters( 'do_shortcode_tag', $html, 'hubspot', [ 'form_id' => self::FORM ] );

		$this->assertSame( 1, $calls, 'Rendering runs the atts filter once, including the after-render step.' );
		$this->assertSame( 'modern', $data['mode'] );
		$this->assertSame( [ 'listing_id' => 'L1' ], array_intersect_key( $data['scopes']['instance'], [ 'listing_url' => 1, 'note' => 1, 'listing_id' => 1 ] ), 'Empty values are skipped while the layer is on.' );
	}

	public function test_form_create_options_gets_the_old_seed(): void {
		add_filter( self::OLD . 'form_create_options', static fn( array $options ) => self::FORM === $options['formId'] ? $options + [ 'css' => '' ] : $options );

		$this->assertSame( [ 'css' => '' ], ShortcodeTest::render( [ 'form_id' => self::FORM ] )[0]['options'] );
	}

	public function test_modern_forms_map_field_names(): void {
		add_filter( self::OLD . 'v4_field_map', static fn() => [ 'listing_id' => '2-123/listing_id' ] );

		$instance = ShortcodeTest::render( [ 'form_id' => self::FORM, 'mode' => 'modern', 'listing_id' => 'L1' ] )[0]['scopes']['instance'];

		$this->assertArrayHasKey( '2-123/listing_id', $instance );
	}

	public function test_on_submit_and_gated_url_render_a_template(): void {
		$after = static fn( array $atts ) => apply_filters( 'do_shortcode_tag', ShortcodeTest::render( $atts )[1], 'hubspot', $atts );

		$this->assertStringEndsWith( '<template class="wphsf-on-submit" data-redirect="https://example.com/thanks" data-delay="1"></template>', $after( [ 'form_id' => self::FORM, 'on_submit' => 'redirect', 'on_submit_url' => 'https://example.com/thanks' ] ) );
		$this->assertStringContainsString( '<a href="https://example.com/brochure.pdf" target="_blank">', $after( [ 'form_id' => self::FORM, 'gated_url' => 'https://example.com/brochure.pdf' ] ) );
		$this->assertArrayNotHasKey( 'on_submit', ShortcodeTest::render( [ 'form_id' => self::FORM, 'on_submit' => 'redirect' ] )[0]['scopes']['instance'] );
	}

	public function test_old_wrapper_classes_and_filter(): void {
		$this->assertStringStartsWith( '<div class="wp-hubspot-form hs-form-wrapper hs-form-enquiry hs-form-mode-legacy"', ShortcodeTest::render( [ 'form_id' => self::FORM, 'name' => 'enquiry' ] )[1] );

		add_filter( self::OLD . 'wrapper_class', static fn( array $classes ) => [ ...$classes, 'extra' ] );
		$this->assertStringStartsWith( '<div class="wp-hubspot-form hs-form-wrapper hs-form-default hs-form-mode-legacy extra"', ShortcodeTest::render( [ 'form_id' => self::FORM ] )[1] );
	}
}
