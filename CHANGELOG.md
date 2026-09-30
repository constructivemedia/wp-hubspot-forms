# Changelog

Notable changes to WP HubSpot Forms. Versions follow [Semantic Versioning](https://semver.org/).

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

### Deprecated, to be removed in 2.0

Everything from Constructive Media HubSpot Forms keeps working and raises a deprecation notice when used. See "Upgrading" in README.md.

- The `constructivemedia/hubspot/forms/*` filters and actions.
- The built-in default region, ap1.
- The `name`, `on_submit`, `on_submit_url`, `on_submit_html`, `on_submit_delay` and `gated_url` attributes, and the `hs-form-wrapper hs-form-{name} hs-form-mode-{mode}` classes.
- The automatic `website`, `website_url`, `form_id` and `portal_id` values.
- Loading HubSpot's legacy library (`hsforms-loader`) and the old helper on every page.
- `window.CMHubspotForms` and `window.hubspotData`.

### Changed from Constructive Media HubSpot Forms

- The built-in portal ID is gone. Set `portal_id` with `wp_hubspot_forms_settings`; without one, forms don't render.
- The plugin's script renders each form into its container; the shortcode no longer prints inline scripts.
- Legacy forms get a HubSpot `formInstanceId`, which HubSpot appends to the form's and fields' element ids.
- The old helper's setters apply asynchronously, and its getters return v4 values as of the last read.
- The `build_region` and `build_type` values that `hubspot.php` computed from site logic are gone. README.md shows how a site adds its own.
