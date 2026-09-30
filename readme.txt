=== WP HubSpot Forms ===
Contributors: constructivemedia
Tags: hubspot, forms, shortcode, marketing
Requires at least: 6.7
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed HubSpot forms with [hubspot] and fill their fields by property name from PHP and JavaScript.

== Description ==

A plugin for developers. It has no settings screen: forms are placed with a shortcode, and their fields are filled through WordPress filters and a small JavaScript API.

* Legacy HubSpot forms, and forms built in HubSpot's new editor, in the page or in HubSpot's iframe.
* Values by HubSpot property name, for every form, for every copy of one form, or for one copy.
* Only fields a form actually has are filled. HubSpot's defaults and what the visitor typed are kept unless a value is forced.
* Forms added later, such as in modals or AJAX content, render and fill too.
* Replaces the Constructive Media HubSpot Forms plugin. Its hooks, attributes and browser API keep working, with deprecation notices, until 2.0.

The full guide is README.md in the plugin folder.

== Installation ==

1. Deactivate the Constructive Media HubSpot Forms plugin, and remove any theme include of its older hubspot.php file. They register [hubspot] too.
2. Upload the release zip in Plugins, Add New Plugin, Upload Plugin, and activate it.
3. Set your portal and region with the wp_hubspot_forms_settings filter.
4. Add [hubspot form_id="..."] to a page.
5. In HubSpot, add every domain that shows forms as a site domain. HubSpot files submissions from other domains as spam.

== Frequently Asked Questions ==

= Which mode should I use? =

Forms built in HubSpot's legacy editor use the default, mode="legacy". Forms built in the new editor use mode="modern-iframe", or mode="modern" on Marketing Hub or Content Hub Professional and Enterprise. A new-editor form placed in legacy mode switches to modern-iframe by itself.

= A value doesn't appear in the form. Why? =

In the browser console, run WPHubSpotForms.debug = true, or WPHubSpotForms.instances()[0].inspect(). Each field shows its value, what the plugin wants to write, and why it did or didn't. A field that already holds a HubSpot default or the visitor's input is only replaced by a forced value.

= Does it work with full-page caching? =

Yes. Values from PHP are part of the cached page, so set visitor-specific values, such as UTM parameters, from JavaScript.

== Changelog ==

= 1.0.0 =
* First release. Replaces Constructive Media HubSpot Forms 5.0.0.

== Upgrade Notice ==

= 1.0.0 =
Replaces Constructive Media HubSpot Forms. Deactivate the old plugin before activating this one.
