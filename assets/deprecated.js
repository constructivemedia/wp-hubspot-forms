/**
 * Compatibility with the Constructive Media HubSpot Forms plugin's browser API.
 *
 * Provides window.CMHubspotForms and window.hubspotData, and acts on the [hubspot on_submit] and
 * gated_url templates, all on top of wp_hubspot_forms. Loaded in the head of every
 * page, as the old helper was. Each old API warns once in the console. Deprecated since 1.0.0, and
 * removed in 2.0.
 */
(() => {
	'use strict';

	const SELECTOR = '[data-wphsf]';

	/** Warns once per old API. */
	const warned = new Set();
	const deprecated = (name, instead) => {
		if (warned.has(name)) return;
		warned.add(name);
		console.warn(`[wp_hubspot_forms] ${name} is deprecated; use ${instead}.`);
	};

	/** Runs a callback with the API, now or once it has loaded. */
	const queue = (callback) => (window.wp_hubspot_forms ||= []).push(callback);

	/** The API, or null while it hasn't loaded. */
	const live = () => (Array.isArray(window.wp_hubspot_forms) ? null : window.wp_hubspot_forms ?? null);

	/**
	 * The containers an old-style target refers to. No target means every form on the page. A
	 * selector or element means the form it's in, or the form inside it.
	 */
	const containers = (target) => {
		if (!target) return [...document.querySelectorAll(SELECTOR)];

		const element = typeof target === 'string' ? document.querySelector(target) : target;
		const container = element?.closest?.(SELECTOR) ?? element?.querySelector?.(SELECTOR);
		return container ? [container] : [];
	};

	/** The instance of the first form a target refers to, or null. */
	const instance = (target) => {
		const [container] = containers(target);
		return (container && live()?.instance(container)) ?? null;
	};

	/** Calls a callback with each instance a target refers to, once the API has loaded. */
	const each = (target, callback) => queue((api) => {
		for (const container of containers(target)) {
			const form = api.instance(container);
			if (form) callback(form, container);
		}
	});

	/** An object with one entry per name. */
	const byName = (names, value) => Object.fromEntries(names.map((name) => [name, value(name)]));

	// The old helper overwrote fields whatever they held, hence { force: true }.
	const methods = {
		getMode(target) {
			const form = instance(target);
			if (!form?.form) return null;
			return form.mode === 'legacy' ? 'legacy' : 'modern';
		},

		getFormId: (target) => instance(target)?.formId ?? null,

		getContainers: () => containers(null),

		setFieldValue: (target, name, value) => methods.setFieldValues(target, { [name]: value }),

		setFieldValues: (target, fields) => each(target, (form) => form.set(fields, { force: true })),

		getFieldValue: (target, name) => methods.getFieldValues(target, [name])?.[name] ?? null,

		// The old helper answered at once, so these are the values as last read.
		getFieldValues(target, names) {
			const fields = instance(target)?.inspect().fields;
			if (!fields) return null;
			return byName(names, (name) => (fields[name] ?? fields[`0-1/${name}`])?.value || null);
		},

		submit: (target) => each(target, (form, container) => {
			const button = form.form?.querySelector?.('[type=submit], .hs-button') ?? container.querySelector('[type=submit], .hs-button');
			button?.click();
		}),

		reset: (target, names) => each(target, (form) => {
			if (names) form.set(byName(names, () => null), { force: true });
			else form.reload();
		}),

		onReady(target, callback) {
			const done = new WeakSet();
			const fire = (container) => {
				if (done.has(container) || (target && !containers(target).includes(container))) return;
				done.add(container);
				try {
					callback(container);
				} catch {} // The old helper ignored errors in callbacks too.
			};

			queue((api) => {
				for (const form of api.instances()) {
					if (form.state === 'ready') fire(form.element);
				}
			});
			document.addEventListener('constructivemedia/hubspot/forms/ready', (event) => fire(event.target));
		},
	};

	window.CMHubspotForms = Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, (...args) => {
		deprecated(`CMHubspotForms.${name}()`, 'window.wp_hubspot_forms');
		return method(...args);
	}]));

	// window.hubspotData filled every form, over the shortcode's values. Empty entries were ignored.
	document.addEventListener('constructivemedia/hubspot/forms/ready', (event) => {
		const data = Object.entries(window.hubspotData ?? {}).filter(([, value]) => value != null && value !== '');
		if (!data.length) return;

		deprecated('window.hubspotData', 'wp_hubspot_forms.set(values, { force: true })');
		event.detail.instance.set(Object.fromEntries(data), { force: true });
	});

	// [hubspot on_submit="redirect|html"] and gated_url add a <template> after the form, saying what
	// to show or where to go after a submission.
	document.addEventListener('constructivemedia/hubspot/forms/submitted', ({ target }) => {
		const then = target.nextElementSibling;
		if (!then?.matches('template.wphsf-on-submit')) return;

		setTimeout(() => {
			if (then.dataset.redirect) location.assign(then.dataset.redirect);
			else target.replaceChildren(then.content.cloneNode(true));
		}, Number(then.dataset.delay));
	});
})();
