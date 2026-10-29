# Changelog

Notable changes to WP HubSpot Forms. Versions follow [Semantic Versioning](https://semver.org/).

## 1.1.0 - 2026-10-29

### Added

- **Visitor entry.** The plugin can remember how each visitor arrived (the landing page, the referring site and the landing page's parameters, such as UTM parameters and ad click ids) until they have been away for three hours, and fill the HubSpot properties a site maps with the new `constructivemedia/hubspot/forms/entry` filter on every form. Arriving with campaign parameters starts a new entry. The entry is made, kept and applied in the browser, from the landing page on, so it works with full-page caching; PHP doesn't see it. Nothing loads until a site maps a property.

### Changed

- Deprecated layer: a form with both `on_submit` and `gated_url` follows `on_submit`, so an `atts` callback that turns `gated_url` into `on_submit="redirect"` redirects.

## 1.0.1 - 2026-09-30

Moves the plugin's names under the `constructivemedia` convention shared by Constructive Media plugins. 1.0.0 was installed on Constructive Media sites only, so this is a patch release with breaking renames rather than a major version.

### Breaking changes

- **PHP hooks** are now `constructivemedia/hubspot/forms/settings`, `.../atts`, `.../global_values`, `.../form_values` and `.../legacy`, replacing `wp_hubspot_forms_settings`, `_atts`, `_global_values`, `_form_values` and `_legacy`. Arguments and behaviour are unchanged. Rename the filters in your theme or plugin.
- **JavaScript global** is now `window.wp_hubspot_forms`, replacing `window.WPHubSpotForms`. The early-queue pattern becomes `(window.wp_hubspot_forms ||= []).push(...)`.
- **JavaScript events** are now `constructivemedia/hubspot/forms/ready`, `.../apply` and `.../submitted`, replacing `wphsf:ready`, `wphsf:apply` and `wphsf:submitted`.
- **PHP namespace** is now `ConstructiveMedia\HubSpot\Forms`, replacing `WpHubspotForms`. Only code that referenced the `Shortcode` class or the `VERSION` constant directly is affected.

Unchanged: the `[hubspot]` shortcode and its attributes, the `wp-hubspot-forms` script handle, the `wp-hubspot-form` container class and its `data-wphsf` attribute, and every deprecated hook, attribute and `CMHubspotForms` method.

### Changed

- The old `atts` filter and the new one share a name, so the deprecated layer applies the old plugin's conversions after every `atts` callback and raises no deprecation notice for it. Values from `atts` keep their meaning; only the old `form_data` filter's values and the automatic website values are dropped when empty. While the layer is on, an unknown `mode` renders as `legacy`.

## 1.0.0 - 2026-09-28

First release. Replaces Constructive Media HubSpot Forms 5.0.0 and its older `hubspot.php`.

### Added

- The `[hubspot]` shortcode, for legacy forms and for forms built in HubSpot's new editor, in the page (`modern`) or in HubSpot's iframe (`modern-iframe`).
- Values by HubSpot property name in three scopes, global, form and instance, from shortcode attributes, four filters and `window.WPHubSpotForms`.
- Protection for HubSpot's defaults and prefill and for the visitor's input, with `{ force: true }` to override.
- Forms added to the page later, such as in modals or AJAX content, render and fill. A removed form releases its container; its values stay for when it comes back.
- New-editor forms placed in legacy mode switch to `modern-iframe`.
- The `wphsf:ready`, `wphsf:apply` and `wphsf:submitted` events, and `inspect()` and `debug` for troubleshooting.
- The `wp_hubspot_forms_legacy` filter, to turn the deprecated layer off.
- Installable with Composer (`composer/installers`) into `wp-content/plugins`. Requires PHP 8.1 and WordPress 6.7.

### Deprecated, to be removed in 2.0

Everything from Constructive Media HubSpot Forms keeps working and raises a deprecation notice when used. See "Upgrading" in README.md.

- The `constructivemedia/hubspot/forms/*` filters and actions.
- The built-in default region, ap1.
- The `name`, `on_submit`, `on_submit_url`, `on_submit_html`, `on_submit_delay` and `gated_url` attributes, and the `hs-form-wrapper hs-form-{name} hs-form-mode-{mode}` classes.
- The automatic `website`, `website_url`, `form_id` and `portal_id` values.
- Loading HubSpot's legacy library (`hsforms-loader`) and the old helper on every page.
- `window.CMHubspotForms` and `window.hubspotData`.

### Changed from Constructive Media HubSpot Forms

- The built-in portal ID is gone. Set `portal_id` with the settings filter; without one, forms don't render.
- The plugin's script renders each form into its container; the shortcode no longer prints inline scripts.
- Legacy forms get a HubSpot `formInstanceId`, which HubSpot appends to the form's and fields' element ids.
- The old helper's setters apply asynchronously, and its getters return v4 values as of the last read.
- The `build_region` and `build_type` values that `hubspot.php` computed from site logic are gone. README.md shows how a site adds its own.
