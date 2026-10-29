/**
 * WP HubSpot Forms: the visitor's entry.
 *
 * Remembers how the visitor arrived: the page they landed on, the site that sent them, and the
 * landing page's parameters, such as utm_source or gclid. The entry is kept while they browse and
 * when they come back, until they have been away for three hours. Arriving with campaign
 * parameters starts a new entry and forgets the old one whole, so an entry never mixes two
 * campaigns.
 *
 * Every form gets the properties the site maps to the entry with the
 * constructivemedia/hubspot/forms/entry filter, forced: the entry's values replace HubSpot's
 * defaults and prefill. A property the entry has no value for is left alone.
 */
(() => {
	'use strict';

	/** Where the entry is kept, in localStorage. */
	const KEY = 'wp_hubspot_forms_entry';

	/** How long an entry outlives the visitor's last page view: three hours. */
	const KEEP = 3 * 60 * 60 * 1000;

	/** The click ids ad platforms add to their links. Like utm_* parameters, they mark a campaign. */
	const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'yclid'];

	/** The entry's own keys. Every other key in the map names a parameter of the landing page. */
	const OWN = ['url', 'referrer'];

	/** The site's map from HubSpot property to entry key, which the plugin prints as JSON. */
	const map = JSON.parse(document.getElementById('wp-hubspot-forms-entry')?.textContent ?? '{}');

	/** The entry an earlier page kept, or null when there is none or it has expired. */
	const kept = () => {
		try {
			const entry = JSON.parse(localStorage.getItem(KEY));
			return Date.now() - entry.seen < KEEP ? entry : null;
		} catch {
			return null;
		}
	};

	// A utm_* parameter, a click id or another parameter the site maps marks a campaign.
	const tracked = Object.values(map).filter((key) => !OWN.includes(key));
	const campaign = [...new URLSearchParams(location.search).keys()].some((name) => name.startsWith('utm_') || CLICK_IDS.includes(name) || tracked.includes(name));

	// The referrer counts when another site sent the visitor, not the site's own pages.
	const referrer = document.referrer !== '' && new URL(document.referrer).hostname !== location.hostname ? document.referrer : '';

	// This page starts a new entry when it brings a campaign, or when there is no entry to keep: on a
	// first visit, or after three hours away. Its forms are filled from the entry, not from storage.
	const entry = (!campaign && kept()) || { url: location.origin + location.pathname + location.search, referrer };
	entry.seen = Date.now();
	try {
		localStorage.setItem(KEY, JSON.stringify(entry));
	} catch {} // Storage is blocked or full: the entry lasts for this page only.

	const landing = new URL(entry.url, location.href).searchParams;
	const values = {};
	for (const [property, key] of Object.entries(map)) {
		const value = OWN.includes(key) ? entry[key] : landing.get(key);
		if (value != null && value !== '') values[property] = value; // Missing or empty: not provided.
	}

	(window.wp_hubspot_forms ||= []).push((forms) => forms.set(values, { force: true }));
})();
