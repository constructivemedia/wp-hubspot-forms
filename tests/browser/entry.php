<?php
/**
 * Dev site only: `ddev setup` copies this into wp-content/mu-plugins, so run it again after an
 * edit. With ?entry in the address, the sandbox's forms take values from the visitor entry, for
 * tests/browser/run.mjs. The test forms have no UTM properties, so other fields stand in:
 * subscribersource_2 has a HubSpot default ('Other Source'), and the rest start empty.
 *
 * @package ConstructiveMedia\HubSpot\Forms
 */

add_filter(
	'constructivemedia/hubspot/forms/entry',
	static fn( array $map ): array => isset( $_GET['entry'] ) ? $map + [
		'gatrackid'          => 'utm_source',
		'gaclientid'         => 'utm_medium',
		'subscribersource_2' => 'utm_content',
		'gauserid'           => 'gclid',
		'email'              => 'url',
		'company'            => 'referrer',
		'firstname'          => 'promo',
	] : $map
);
