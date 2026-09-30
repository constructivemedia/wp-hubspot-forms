# WP HubSpot Forms

Embed HubSpot forms with `[hubspot]`, and fill their fields by HubSpot property name from PHP and JavaScript.

- Legacy forms, and forms built in HubSpot's new editor ("v4"), in the page or in HubSpot's iframe.
- Values in three scopes: every form, every copy of one form, or one copy.
- Only fields a form actually has are filled. HubSpot's defaults and the visitor's input are kept unless a value is forced.
- Forms added later, such as in modals or AJAX content, render and fill too.
- No settings screen, no database tables. Everything is a shortcode, a filter or a JavaScript call.

Requires PHP 8.1 and WordPress 6.7. It replaces the Constructive Media HubSpot Forms plugin; see [Upgrading](#upgrading-from-constructive-media-hubspot-forms).

**Contents:** [Quick start](#quick-start), [Shortcode](#the-shortcode), [Modes](#modes-legacy-and-v4), [Values](#values), [PHP hooks](#php-hooks), [JavaScript API](#javascript-api), [Debugging](#debugging), [HubSpot setup](#hubspot-setup), [Upgrading](#upgrading-from-constructive-media-hubspot-forms), [Development](#development), [Releasing](#releasing).

## Quick start

1. Install the release zip, or [with Composer](#installing-with-composer), and activate it. Deactivate the old Constructive Media plugin first, if the site has it.
2. Tell the plugin your HubSpot account and its region, in the theme or a small plugin. Set both: while the [deprecated layer](#upgrading-from-constructive-media-hubspot-forms) is on, a region you leave out is `ap1`.

   ```php
   add_filter( 'constructivemedia/hubspot/forms/settings', static fn( array $settings ): array => [ 'portal_id' => '12345678', 'region' => 'na1' ] + $settings );
   ```

3. Place a form:

   ```
   [hubspot form_id="1a2b3c4d-1111-2222-3333-444455556666"]
   ```

4. Fill its fields, from the shortcode, PHP or JavaScript:

   ```
   [hubspot form_id="1a2b3c4d-1111-2222-3333-444455556666" listing_id="L-1001" listing_type="package"]
   ```

   ```js
   (window.wp_hubspot_forms ||= []).push((forms) => forms.set({ campaign: 'spring-open-day' }));
   ```

### Installing with Composer

The package isn't on Packagist. Point the site's `composer.json` at the GitHub repository and require the package. Its type is `wordpress-plugin`, so `composer/installers` puts it in `wp-content/plugins/wp-hubspot-forms`:

```json
{
  "repositories": [
    { "type": "vcs", "url": "https://github.com/constructivemedia/wp-hubspot-forms" }
  ],
  "require": {
    "constructivemedia/wp-hubspot-forms": "^1.0"
  },
  "config": {
    "allow-plugins": { "composer/installers": true }
  }
}
```

Composer needs access to the private repository, and a version constraint needs a matching tag, such as `v1.0.0`. Sites that keep WordPress in a subdirectory set the path in `extra.installer-paths`, for example `"web/wp-content/plugins/{$name}/": ["type:wordpress-plugin"]`. Development files are left out of the installed copy.

## The shortcode

```
[hubspot form_id="..." mode="modern-iframe" instance="enquiry" class="cta-form" listing_id="L-1001"]
```

These attributes configure the form. Every other attribute is a value for the property of that name.

| Attribute | Default | Format and meaning |
|---|---|---|
| `form_id` | | Required. The form's GUID from HubSpot, in any case. |
| `portal_id` | `constructivemedia/hubspot/forms/settings` | Required. Your HubSpot account ID (digits). |
| `region` | `na1` (`ap1` while the deprecated layer is on) | Your account's data region, lower case: `na1`, `na2`, `eu1`, `ap1`, and so on. It is in the embed code HubSpot gives you. |
| `mode` | `legacy` | `legacy`, `modern` or `modern-iframe`. See [Modes](#modes-legacy-and-v4). |
| `instance` | automatic | A key for this copy of the form, for JavaScript: a lower-case letter, then up to 63 lower-case letters, digits, `-` or `_`. |
| `business_unit_id` | | The HubSpot business unit (brand) the submission belongs to (digits). |
| `class` | | Extra classes for the container, which always has `wp-hubspot-form`. |

- **Empty attributes are ignored.** `listing_id=""` means "not set". To clear a field, use `null` from the `constructivemedia/hubspot/forms/atts` filter.
- **Settings are validated.** A missing or malformed setting renders nothing, and WordPress reports it when `WP_DEBUG` is on.
- **Values survive the editor.** Post content stores `&` as `&amp;`; the plugin decodes it, so `listing_type="House &amp; Land"` arrives as `House & Land`.
- **Legacy styling options** (`css`, `cssClass`, `submitButtonClass`, `errorClass`, `locale`, `translations`) can be passed as an `options` array through `constructivemedia/hubspot/forms/atts`. Callbacks can't: use the [events](#events) instead.

The shortcode outputs an empty container, and the plugin's script renders the form into it:

```html
<div class="wp-hubspot-form cta-form" data-wphsf="{...settings and values as JSON...}"></div>
```

## Modes: legacy and v4

HubSpot has two kinds of forms, and each renders differently. Pick the mode that matches how the form was built.

| `mode` | For forms built in | Renders | HubSpot plan |
|---|---|---|---|
| `legacy` | the legacy editor | in the page, with HubSpot's `v2.js` | any |
| `modern-iframe` | the new editor | in HubSpot's iframe | any |
| `modern` | the new editor | in the page, as HubSpot's "developer code" | Marketing Hub or Content Hub Professional or Enterprise |

The plugin hides most of the differences. These remain:

- **A new-editor form in legacy mode** renders as `modern-iframe` by itself, with a console warning. Set the mode to avoid the extra round trip.
- **`modern` supports one HubSpot account per page.** That is HubSpot's limit. Use `modern-iframe` for forms from a second account.
- **Submitted values:** `constructivemedia/hubspot/forms/submitted` fires for every form, but only legacy forms include the values in `detail.values`. HubSpot's v4 success event carries just the form and instance ids.
- **Phone numbers set from code** are best in international format, such as `+61412345678`. Legacy forms add the form's default country code to a local number. v4 forms read `0412 345 678` as `+0412345678`. What visitors type isn't affected.
- **Styling options** (`options`) apply to legacy forms only. Style v4 forms in HubSpot.

## Values

### Scopes

Every value belongs to one of three scopes. When a field has values in several, the most specific wins: instance, then form, then global. Within one scope, a value set from JavaScript beats one from PHP.

| Scope | Covers | From PHP | From JavaScript |
|---|---|---|---|
| global | every form on the page | `constructivemedia/hubspot/forms/global_values` | `wp_hubspot_forms.set()` |
| form | every copy of one form | `constructivemedia/hubspot/forms/form_values` | `wp_hubspot_forms.form(formId).set()` |
| instance | one copy | attributes, `constructivemedia/hubspot/forms/atts` | `wp_hubspot_forms.instance(key).set()` |

### What gets overwritten

The plugin only writes to fields the form has. For each one, it compares what the field holds now with what HubSpot put there and with what the plugin itself wrote last:

| The field holds | Unforced value | Forced value |
|---|---|---|
| nothing | written | written |
| a value the plugin wrote | replaced | replaced |
| HubSpot's value (a default, URL or returning-visitor prefill) | kept (`protected:hubspot`) | replaced |
| what the visitor typed | kept (`protected:user`) | replaced |

- **Attributes and `constructivemedia/hubspot/forms/atts` are forced.** They are this form's own instructions, so they replace HubSpot's defaults and prefill when the form renders.
- **Everything else is unforced** unless you pass `{ force: true }` to `set()`.
- **Force applies to the call that makes it.** A later unforced `set()`, even of a field with a forced attribute, never replaces what the visitor typed.
- **Consent checkboxes and file fields are never touched.**

### Value meanings

The plugin never tests values for truthiness. `0` is a value, not "nothing".

| Value | Meaning |
|---|---|
| key left out, or `undefined` in JavaScript | Not provided: the field is left alone. |
| `null` or `""` | Clear the field. Clearing follows the same protection rules as writing. |
| `0`, `"0"`, `false` | Real values. Numbers become strings. |
| `true`, `"true"`, `1`, `"1"` | Check a single checkbox. Any other value unchecks it. |
| an array, or `"a;b"` | The options to select in a multiple-checkbox or multi-select field, by their internal values. A string is split on `;`, HubSpot's own separator. Commas don't separate options. |

PHP drops entries it can't send, and reports them with `WP_DEBUG`: keys that aren't property names, objects, nested arrays and invalid UTF-8.

### Property names

Use HubSpot's internal property names, not the labels. A bare name, such as `listing_id`, matches that property on any object. Qualify it to target one object's field: `0-1/` is contacts, `0-2/` companies, and `2-...` custom objects, as in `0-2/name`.

## PHP hooks

| Filter | Arguments | Use it for |
|---|---|---|
| `constructivemedia/hubspot/forms/settings` | `array $settings, string $form_id` | Defaults for the attributes that configure a form: `portal_id`, `region`, `mode`, `business_unit_id`. Shortcode attributes win. |
| `constructivemedia/hubspot/forms/atts` | `array $atts, string $form_id` | This form's attributes, merged with the settings. Change settings, or add values that behave like attributes. |
| `constructivemedia/hubspot/forms/global_values` | `array $values` | Values for every form. Runs once per request. |
| `constructivemedia/hubspot/forms/form_values` | `array $values, string $form_id` | Values for every copy of one form. Runs once per form per request. |
| `constructivemedia/hubspot/forms/legacy` | `bool $enabled` | Return `false` to turn off the [deprecated layer](#upgrading-from-constructive-media-hubspot-forms). Add it in a plugin or `functions.php`; it is read on `after_setup_theme`. |

`$form_id` is always lower case.

```php
// A different account, or the new editor, for particular forms.
add_filter(
	'constructivemedia/hubspot/forms/settings',
	static function ( array $settings, string $form_id ): array {
		if ( 'aaaaaaaa-1111-2222-3333-444455556666' === $form_id ) {
			$settings['mode'] = 'modern-iframe';
		}
		return $settings;
	},
	10,
	2
);

// Values that come from the page, like attributes: they replace HubSpot's defaults.
add_filter(
	'constructivemedia/hubspot/forms/atts',
	static function ( array $atts ): array {
		if ( is_singular( 'listing' ) ) {
			$atts += [ 'listing_id' => (string) get_the_ID() ];
		}
		return $atts;
	}
);

// Shared values: they fill empty fields only.
add_filter( 'constructivemedia/hubspot/forms/global_values', static fn( array $values ): array => $values + [ 'agency_id' => 'example-agency' ] );
```

`+=` keeps whatever the shortcode already set. Assign with `$atts['listing_id'] = ...` to override it.

**Caching:** values from PHP become part of the page's HTML, so full-page caching serves them to every visitor. Set visitor-specific values, such as UTM parameters or a logged-in member's details, from JavaScript.

**Forms loaded later:** the shortcode loads the script on the pages it renders on. If forms arrive later on a page without one, for example from an AJAX response, load it yourself with `wp_enqueue_script( 'wp-hubspot-forms' )`. While the deprecated layer is on, it loads on every page.

## JavaScript API

The script loads deferred in the footer and sets `window.wp_hubspot_forms`. Code that may run first queues a callback, which runs at once if the script is already there:

```js
(window.wp_hubspot_forms ||= []).push((forms) => {
	// forms === window.wp_hubspot_forms
});
```

### Setting values

```js
wp_hubspot_forms.set({ campaign: 'spring' });                                                   // every form
wp_hubspot_forms.form('1a2b3c4d-1111-2222-3333-444455556666').set({ listing_type: 'package' }); // every copy of one form
wp_hubspot_forms.instance('enquiry').set({ listing_id: 'L-1001' }, { force: true });           // one copy
```

Values are stored, then applied to every form in the scope that is ready. Forms that render later get them when they are ready, so it is safe to set values before the form exists. `set()` returns a promise of one result per form it covers:

```js
const [result] = await wp_hubspot_forms.instance('enquiry').set({ listing_id: 'L-1001', email: 'x@example.com', fax: '1' });
// {
//   key: 'enquiry',
//   applied: { '0-1/listing_id': 'L-1001' },
//   skipped: { '0-1/email': 'protected:user', fax: 'no-field' },
// }
```

| Skip reason | Meaning |
|---|---|
| `no-field` | The form has no field for this property. |
| `unchanged` | The field already holds this value. |
| `protected:hubspot` | The field holds HubSpot's value; force to replace it. |
| `protected:user` | The field holds what the visitor typed; force to replace it. |
| `rejected` | HubSpot didn't take the value, for example an option the field doesn't have. The field keeps what it held. Legacy forms only: v4 forms accept any value, so it's reported as applied. |

A form that isn't ready yet returns `{ key, applied: {}, skipped: {}, pending: [names] }`.

### Reference

| `wp_hubspot_forms.` | |
|---|---|
| `set(values, { force })` | Global values. Returns a promise of results. |
| `values()` | The stored global values, with their source and force. |
| `form(formId).set(values, { force })`, `form(formId).values()` | The same for one form's scope. |
| `instance(keyOrElement)` | One copy of a form. A key always returns an instance, even before it renders. An element returns the instance it belongs to, or `null`. |
| `instances()` | The instances currently on the page. |
| `push(callback)` | Calls `callback(wp_hubspot_forms)`. |
| `debug` | Set to `true` to log activity to the console. |

| Instance | |
|---|---|
| `key`, `formId`, `mode` | Identity. `key` is the `instance` attribute, or `hsf-1`, `hsf-2` and so on. |
| `state` | `loading`, `ready`, `submitted`, `error`, or `unmounted` while its container is off the page. |
| `element` | The container. |
| `form` | The rendered form: the `<form>` element for legacy forms, HubSpot's form object for v4. |
| `set(values, { force })`, `values()` | This instance's scope. |
| `await get(property)` | A field's current value as a string: several options joined with `;`, a checked checkbox as `"true"`. `undefined` if the form isn't ready or lacks the field. |
| `reload()` | Renders the form again, keeping its values. HubSpot forms submit once; reload to show a fresh one. |
| `inspect()` | A snapshot for [debugging](#debugging). |

Keys are unique on the page. When two containers ask for the same `instance`, the second gets an automatic key. A container that leaves the page and comes back, as in a modal, keeps its instance and its values.

### Events

Events bubble from the container, so one listener on `document` hears every form. `event.detail.instance` is the instance.

| Event | When | `event.detail` also has |
|---|---|---|
| `constructivemedia/hubspot/forms/ready` | The form rendered and its values were applied. Fires again after `reload()`. | `applied`, `skipped` |
| `constructivemedia/hubspot/forms/apply` | A `set()` changed at least one field. | `applied`, `skipped` |
| `constructivemedia/hubspot/forms/submitted` | HubSpot accepted a submission. | `values`, for legacy forms |

### Examples

UTM parameters from the address, for every form:

```js
(window.wp_hubspot_forms ||= []).push((forms) => {
	const utm = [...new URLSearchParams(location.search)].filter(([name]) => name.startsWith('utm_'));
	forms.set(Object.fromEntries(utm));
});
```

One enquiry form in a modal, reused for each listing:

```
[hubspot form_id="..." instance="enquiry"]
```

```js
document.addEventListener('click', (event) => {
	const card = event.target.closest('[data-listing-id]');
	if (!card) return;
	const form = wp_hubspot_forms.instance('enquiry');
	if (form.state === 'submitted') form.reload();
	form.set({ listing_id: card.dataset.listingId, agent_email: card.dataset.agentEmail ?? null }, { force: true });
	openModal();
});
```

After a submission:

```js
document.addEventListener('constructivemedia/hubspot/forms/submitted', ({ detail }) => {
	window.dataLayer?.push({ event: 'hubspot_form_submitted', form_id: detail.instance.formId });
});
```

## Debugging

- **`wp_hubspot_forms.debug = true`** logs every `ready`, `apply` and `submitted` event with its result, and containers the script ignored, in the console.
- **`wp_hubspot_forms.instances().map((form) => form.inspect())`** shows every form's state and, per field, `value` (what it holds), `hubspot` (what HubSpot put there), `written` (what the plugin wrote), `want` (the value the plugin resolved, with its scope, source and force) and `last` (the last outcome). Legacy values are live; v4 values are as of the last read, and `await form.get(name)` reads afresh.
- **`WP_DEBUG`** reports invalid settings and dropped values from PHP.
- **Console warnings** starting with `[wp_hubspot_forms]` report forms that failed: a HubSpot script that didn't load, a render error, or a v4 form that stopped answering. They also flag a new-editor form placed in legacy mode.

A form that never becomes ready is usually a wrong `portal_id`, `region` or `mode`, or a script blocker. Compare the settings with the embed code HubSpot gives you for the form.

## HubSpot setup

- **Register the site's domains.** Add every domain that shows forms, including staging, as a site domain in HubSpot. HubSpot files submissions from other domains as spam.
- **Tracking code.** The plugin doesn't add HubSpot's tracking code. Install it, for example with HubSpot's own plugin, for analytics and to recognise returning visitors. The two plugins coexist; HubSpot's libraries load once.
- **Content Security Policy.** Sites that send one must allow HubSpot's form hosts: `js.hsforms.net` and `js-{region}.hsforms.net` for scripts and frames, and `forms.hsforms.com` and `forms-{region}.hsforms.com` for submissions. HubSpot documents the full list, which includes reCAPTCHA.
- **Consent tools** that block scripts until cookies are accepted can stop forms rendering.

**Browsers:** Safari 15.4, Chrome and Edge 93, Firefox 92, and later. Older browsers don't run the script, so forms don't render in them.

**Known gaps:** on legacy forms, conditional fields that appear after the form is ready get values on the next `set()`, not by themselves.

## Upgrading from Constructive Media HubSpot Forms

1. **Deactivate the old plugin.** It also registers `[hubspot]`, the `hsforms-loader` script and `window.CMHubspotForms`. Also remove any theme include of the older `hubspot.php`.
2. **Activate this plugin.** Existing shortcodes, hooks and scripts keep working through the deprecated layer (`src/deprecated.php` and `assets/deprecated.js`).
3. **Turn on `WP_DEBUG`** and browse the site. Each old hook or attribute the site uses raises a deprecation notice, and each old browser API warns once in the console.
4. **Migrate each one**, using the table below.
5. **Set the portal and region** with `constructivemedia/hubspot/forms/settings`. The old plugin's built-in portal ID is not carried over: without a portal, forms don't render. Its default region, `ap1`, belongs to the deprecated layer.
6. **Turn the layer off**, once nothing raises a notice:

   ```php
   add_filter( 'constructivemedia/hubspot/forms/legacy', '__return_false' );
   ```

   That also stops loading HubSpot's legacy library and the old helper on every page. The plugin then loads what a page needs, when it has a form.

The deprecated layer will be removed in 2.0.

### Replacements

The old hooks and the new ones share the `constructivemedia/hubspot/forms/` prefix. In the table, "old" names are the rest of the old hook name.

| Old | Use instead |
|---|---|
| `portal_id`, `region` filters, and the built-in portal and region | `constructivemedia/hubspot/forms/settings` |
| `atts` filter | The same hook, `constructivemedia/hubspot/forms/atts`, with the same purpose. Because the name is unchanged, it raises no notice; see [what changes](#what-changes-even-with-the-deprecated-layer-on). |
| `form_data` filter | `constructivemedia/hubspot/forms/atts` for one form's values; `constructivemedia/hubspot/forms/global_values` or `constructivemedia/hubspot/forms/form_values` for shared ones |
| The automatic `website`, `website_url`, `form_id` and `portal_id` values | Add the ones your forms use with `constructivemedia/hubspot/forms/atts`; see below |
| `reserved_keys` filter | Nothing: the reserved attributes are fixed |
| `name` attribute, the `hs-form-wrapper hs-form-{name} hs-form-mode-{mode}` classes, `wrapper_class` filter | The `class` attribute. Every container has `wp-hubspot-form`. |
| `form_create_options` filter | An `options` array through `constructivemedia/hubspot/forms/atts` |
| `v4_field_prefix`, `v4_field_map` filters | Qualified property names, such as `0-2/name` |
| `before_render`, `after_render` actions | `constructivemedia/hubspot/forms/atts`, and WordPress's `do_shortcode_tag` |
| `script_url`, `modern_script_url` filters, the site-wide `hsforms-loader` script | Nothing: the plugin loads HubSpot's libraries. Code that waited for `hsforms-loader` should listen for `constructivemedia/hubspot/forms/ready`. |
| `on_submit`, `on_submit_url`, `on_submit_html`, `on_submit_delay` and `gated_url` attributes, `on_submit` filter | The form's redirect or thank-you message in HubSpot, or the `constructivemedia/hubspot/forms/submitted` event |
| `window.hubspotData` | `wp_hubspot_forms.set(values, { force: true })` |
| `window.CMHubspotForms` | `window.wp_hubspot_forms`, as below |

| `CMHubspotForms.` | `wp_hubspot_forms.` |
|---|---|
| `setFieldValue(target, name, value)`, `setFieldValues(target, fields)` | `instance(element).set(fields, { force: true })`, or `set(fields, { force: true })` for every form |
| `getFieldValue(target, name)`, `getFieldValues(target, names)` | `await instance(element).get(name)` |
| `getMode(target)`, `getFormId(target)` | `instance(element).mode`, `instance(element).formId` |
| `getContainers()` | `instances().map((form) => form.element)` |
| `reset(target, names)` | `instance(element).set({ name: null }, { force: true })`, or `reload()` |
| `submit(target)` | Click the form's submit button. |
| `onReady(target, callback)` | `document.addEventListener('constructivemedia/hubspot/forms/ready', ...)` |

The automatic values, restored without the deprecated layer. Like the old plugin, this fills contact fields only and skips an empty website:

```php
add_filter(
	'constructivemedia/hubspot/forms/atts',
	static function ( array $atts, string $form_id ): array {
		$website = get_website_entry_url();
		if ( $website ) {
			$atts += [ '0-1/website' => $website, '0-1/website_url' => $website ];
		}
		return $atts + [ '0-1/form_id' => $form_id, '0-1/portal_id' => $atts['portal_id'] ];
	},
	10,
	2
);
```

The older `hubspot.php` also filled some properties from the site's own logic, such as a region taken from a site class and a value fixed for one page. The plugin doesn't hard-code business values, so sites that need them add their own, for example:

```php
add_filter(
	'constructivemedia/hubspot/forms/atts',
	static function ( array $atts ): array {
		$region = function_exists( 'my_site_region' ) ? my_site_region() : null;
		if ( $region ) {
			$atts += [ 'build_region' => $region ];
		}
		if ( is_page( 'special-offer' ) ) {
			$atts += [ 'build_type' => 'Special offer' ];
		}
		return $atts;
	}
);
```

### What changes even with the deprecated layer on

- The plugin's script renders each form into its container. The shortcode no longer prints inline scripts.
- Legacy forms get a HubSpot `formInstanceId`, which HubSpot appends to the form's and fields' element ids, as in `hsForm_{form id}_enquiry-1`. The suffix changes with every render, so CSS and scripts should select by class or attribute instead of those ids.
- `CMHubspotForms` setters apply asynchronously, once the form is ready. Its getters return v4 values as of the last read.
- The `atts` filter keeps its name, so old and new callbacks share it and it raises no notice. Its result goes through the old pipeline: `mode` and `region` are normalised, and an unknown `mode` renders as `legacy` instead of being rejected. Values from `atts` keep this plugin's meaning (`null` clears, `0` and `false` are values); only the old `form_data` filter's values and the automatic website values are dropped when empty, as the old plugin did.

## Development

You need [ddev](https://ddev.com). The browser test also needs Node 22 and Chrome or Edge.

```sh
ddev setup                  # WordPress in wp/, this plugin linked and active, and a sandbox page
ddev composer test          # PHPUnit; runs without WordPress (stubs in tests/bootstrap.php)
ddev composer phpcs         # WordPress coding standards
node tests/browser/run.mjs  # Drives the sandbox in headless Chrome or Edge against real HubSpot forms
ddev composer build         # Tests, coding standards, then the release zip
```

- **Site:** https://wp-hubspot-forms.ddev.site, admin / admin.
- **Sandbox:** https://wp-hubspot-forms.ddev.site/sandbox/ has buttons for each behaviour and a log. Its content is `tests/browser/sandbox.html`, which `ddev setup` loads. The forms belong to public HubSpot test accounts, so don't submit them.

| Path | |
|---|---|
| `wp-hubspot-forms.php` | Registers the script and the shortcode, and switches the deprecated layer on. |
| `src/Shortcode.php` | `[hubspot]`: settings, value scopes and output. |
| `assets/wp-hubspot-forms.js` | The value store, the legacy and v4 adapters, and the API. |
| `src/deprecated.php`, `assets/deprecated.js` | The old plugin's hooks, attributes and browser API. Removed in 2.0. |
| `tests/` | PHPUnit tests and the browser test. |
| `bin/build` | Builds the release zip. |

The core knows nothing about the old plugin. Keep anything that exists for backwards compatibility in the two deprecated files.

## Releasing

1. Set the new version in the plugin header, the `VERSION` constant and `Stable tag` in `readme.txt`.
2. Add a `## x.y.z` section to `CHANGELOG.md` and an entry to the changelog in `readme.txt`.
3. Run `ddev composer build`. It stops if the tests or coding standards fail or the versions disagree, then writes `dist/wp-hubspot-forms-x.y.z.zip`. The zip holds only the plugin's runtime files and its docs.
4. Run the browser test.
5. Tag the release `vx.y.z` and attach the zip.

The plugin header sets `Update URI: false`, so WordPress never offers an update for it from wordpress.org. Install new versions from the zip.
