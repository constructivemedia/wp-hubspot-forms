/**
 * WP HubSpot Forms
 *
 * Renders the forms placed with the [hubspot] shortcode, and fills their fields by HubSpot
 * property name. Values are stored in three scopes, and the most specific one wins:
 *
 *   wp_hubspot_forms.set({ utm_source: 'google' });                  // every form
 *   wp_hubspot_forms.form(formId).set({ listing_type: 'package' });  // every copy of one form
 *   wp_hubspot_forms.instance('enquiry').set({ listing_id: '12' });  // one copy, by key or element
 *
 * Values fill empty fields and replace values this script wrote. { force: true } also replaces
 * HubSpot's defaults and prefill, and what the visitor typed.
 *
 * Code that may run before this script loads can queue a callback:
 *
 *   (window.wp_hubspot_forms ||= []).push((forms) => forms.set({ campaign: 'spring' }));
 */
(() => {
	'use strict';

	// Callbacks queued before this script ran. Anything other than an array means it already ran.
	const queued = window.wp_hubspot_forms;
	if (queued && !Array.isArray(queued)) return;

	/** The containers the shortcode renders. */
	const SELECTOR = '[data-wphsf]';

	/**
	 * The format of each form setting. The shortcode validates them too. They're checked again here
	 * because a container is part of the post content, where it could also be written by hand.
	 */
	const VALID = {
		form_id: /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,
		portal_id: /^[1-9]\d{0,11}$/,
		region: /^[a-z]{2}\d$/,
		mode: /^(?:legacy|modern|modern-iframe)$/,
		business_unit_id: /^\d{0,12}$/,
		instance: /^(?:[a-z][a-z0-9_-]{0,63})?$/,
	};

	/** Legacy form options that may be passed to HubSpot's hbspt.forms.create(). */
	const OPTIONS = ['css', 'cssClass', 'submitButtonClass', 'errorClass', 'locale', 'translations'];

	/** Values that tick a single checkbox. Any other value unticks it. */
	const TRUE = new Set([true, 'true', 1, '1']);

	/** Logs to the console while wp_hubspot_forms.debug is true. */
	const log = (...args) => api.debug && console.info('[wp_hubspot_forms]', ...args);

	/* Values ------------------------------------------------------------------------------------ */

	/**
	 * Every value set from PHP or JavaScript, by scope, then by scope id, then by property:
	 *
	 *   store.global.get('')       values for every form
	 *   store.form.get(formId)     values for every copy of one form
	 *   store.instance.get(key)    values for one copy
	 *
	 * Each value is stored as { value, force, source }, where source is 'php' or 'js'.
	 */
	const store = { global: new Map(), form: new Map(), instance: new Map() };

	/** The values of one scope, created on first use. */
	const scope = (name, id = '') => {
		if (!store[name].has(id)) store[name].set(id, new Map());
		return store[name].get(id);
	};

	/** The values of one scope as a plain object, for the API's values() methods. */
	const scopeValues = (name, id) => Object.fromEntries(scope(name, id));

	/**
	 * A value as a list of options. An array is used as it is, a string is split on ';', HubSpot's
	 * separator for multiple options, and null or '' is no options.
	 */
	const list = (value) => {
		if (Array.isArray(value)) return value.map(String);
		if (value == null || value === '') return [];
		return String(value).split(';');
	};

	/**
	 * A value as one string, so what a field holds can be compared with what's wanted. Values are
	 * never tested for truthiness: 0, '0' and false are values, while null and '' clear the field.
	 */
	const canon = (value, kind) => {
		if (kind === 'multi') return list(value).sort().join(';');
		if (kind === 'bool') return TRUE.has(value) ? 'true' : '';
		return list(value).join(';');
	};

	/**
	 * Decides whether a value may replace what a field holds.
	 *
	 * f.current is what the field holds now, f.initial what HubSpot put there when the form rendered,
	 * and f.written what this script wrote last.
	 *
	 * @returns {string} 'write', 'unchanged', 'protected:hubspot' or 'protected:user'.
	 */
	const decide = (f, want, force) => {
		if (f.current === want) return 'unchanged';
		if (force) return 'write';

		const ours = f.written !== undefined;
		if (ours && f.current === f.written) return 'write'; // Still what this script wrote.
		if (!ours && f.current === '' && f.initial === '') return 'write'; // Empty, and always has been.
		if (!ours && f.current === f.initial) return 'protected:hubspot';
		return 'protected:user';
	};

	/**
	 * A field. Fields are identified as objectType/property, such as 0-1/email. Legacy forms name
	 * contact fields without the object type.
	 */
	const field = (name, kind) => {
		const id = name.includes('/') ? name : `0-1/${name}`;
		return { id, name: id.slice(id.indexOf('/') + 1), kind };
	};

	/** An outcome with nothing applied or skipped, which set() and the events report per form. */
	const outcome = (key, extra) => ({ key, applied: {}, skipped: {}, ...extra });

	/* HubSpot libraries ------------------------------------------------------------------------- */

	/** HubSpot's script host for a data region. */
	const host = (region) => (region === 'na1' ? 'https://js.hsforms.net' : `https://js-${region}.hsforms.net`);

	/** A script on the page whose URL matches the pattern. */
	const onPage = (pattern) => [...document.scripts].find((script) => pattern.test(script.src));

	/** Libraries being loaded, by URL pattern. */
	const loading = new Map();

	/**
	 * Loads a HubSpot library once. A copy already on the page, added by the theme or another
	 * plugin, is used instead of loading a second one.
	 *
	 * @param {string}   src     The library's URL.
	 * @param {RegExp}   pattern Matches every URL the library may have been loaded from.
	 * @param {Function} loaded  Whether the library is ready to use.
	 * @returns {Promise<void>}
	 */
	const load = (src, pattern, loaded) => {
		if (loaded()) return Promise.resolve();

		if (!loading.has(pattern.source)) {
			const promise = new Promise((resolve, reject) => {
				let script = onPage(pattern);
				if (!script) {
					script = Object.assign(document.createElement('script'), { src, async: true });
					document.head.appendChild(script);
				}
				script.addEventListener('load', resolve, { once: true });
				script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
			});
			loading.set(pattern.source, promise);
		}

		return loading.get(pattern.source);
	};

	/**
	 * Runs calls to HubSpot's v4 API one at a time: with two calls in flight, HubSpot can hand a
	 * reply to the wrong caller. A form removed mid-call never replies, so each call times out
	 * rather than holding up the calls behind it.
	 */
	let queue = Promise.resolve();
	const serial = (task) => {
		const run = queue.then(() => new Promise((resolve, reject) => {
			const timer = setTimeout(reject, 10000, new Error('HubSpot form did not respond'));
			Promise.resolve().then(task).then(resolve, reject).finally(() => clearTimeout(timer));
		}));
		queue = run.catch(() => {}); // A failed call doesn't stop the next one.
		return run;
	};

	/** Tells HubSpot a control changed. HubSpot only notices changes through bubbling input events. */
	const input = (element) => element.dispatchEvent(new Event('input', { bubbles: true }));

	/* Legacy forms ------------------------------------------------------------------------------ */

	const LEGACY_SCRIPT = /hsforms\.net\/forms\/(?:embed\/)?(?:v2|shell|current)\.js/;

	/**
	 * Controls that are never read or written: HubSpot's own context field, file uploads, and
	 * consent checkboxes, which are the visitor's decision.
	 */
	const ignored = (control) => !control.name
		|| control.name === 'hs_context'
		|| control.type === 'file'
		|| control.name.startsWith('LEGAL_CONSENT.');

	/**
	 * Forms built in HubSpot's legacy editor. hbspt.forms.create() renders them into the page, or
	 * into a same-origin iframe, and their fields are read and written through the DOM.
	 */
	const legacy = {
		/** Loads HubSpot's v2.js, unless the page already has it. */
		load: ({ region }) => load(`${host(region)}/forms/embed/v2.js`, LEGACY_SCRIPT, () => window.hbspt?.forms?.create),

		/** Renders the form, reporting back through the ready, submitted and failed callbacks. */
		render(inst, ready, submitted, failed) {
			// HubSpot renders into a target element. It's reused when the form renders again, so
			// HubSpot replaces its old form instead of adding a second one.
			let target = inst.element.firstElementChild;
			if (!target) {
				target = inst.element.appendChild(Object.assign(document.createElement('div'), { className: 'hbspt-form' }));
			}
			target.id ||= `${inst.renderId}-target`;

			const options = Object.fromEntries(
				OPTIONS.filter((name) => Object.hasOwn(inst.options, name)).map((name) => [name, inst.options[name]]),
			);

			if (inst.businessUnit) {
				// HubSpot doesn't document this option. v2.js adds what it returns to the submission,
				// as setExtraSubmissionMetadata() does for v4 forms.
				options.getExtraMetaDataBeforeSubmit = () => ({ businessUnitId: inst.businessUnit });
			}

			const form = window.hbspt.forms.create({
				...options,
				region: inst.region,
				portalId: inst.portal,
				formId: inst.formId,
				target: `#${target.id}`,
				formInstanceId: inst.renderId, // Keeps the element ids and submissions of repeated forms apart.
				onFormReady: (element) => ready(element?.jquery ? element[0] : element),
				onFormSubmitted: (element, data) => submitted(data?.submissionValues),
			});

			// Render errors are only reported to listeners on the form itself.
			form?.on?.('onRenderError', (type, error) => failed(error ?? type));
		},

		/**
		 * The value of each field the form shows, by field id. Fields are looked up afresh each
		 * time, because dependent fields appear and disappear as the visitor answers.
		 */
		read(inst) {
			const found = new Map();

			for (const control of inst.form.querySelectorAll('input[name], select[name], textarea[name]')) {
				if (ignored(control)) continue;

				const { id } = field(control.name);
				if (!found.has(id)) {
					if (!inst.fields.has(id)) inst.fields.set(id, field(control.name, legacy.kind(control)));
					found.set(id, Object.assign(inst.fields.get(id), { controls: [] }));
				}
				found.get(id).controls.push(control);
			}

			return new Map([...found].map(([id, f]) => [id, legacy.value(f)]));
		},

		/** A field's kind, from the classes HubSpot puts on its wrapper: 'bool', 'multi' or 'text'. */
		kind(control) {
			const classes = control.closest('.hs-form-field')?.classList;
			if (classes?.contains('hs-fieldtype-booleancheckbox')) return 'bool';
			if (classes?.contains('hs-fieldtype-checkbox')) return 'multi';
			return 'text';
		},

		/** A field's value: a boolean for a single checkbox, a list for multiple checkboxes, or a string. */
		value({ kind, controls }) {
			const [first] = controls;

			if (first.type === 'checkbox') {
				if (kind === 'bool') return first.checked;
				return controls.filter((control) => control.checked).map((control) => control.value);
			}
			if (first.type === 'radio') return controls.find((control) => control.checked)?.value ?? '';
			return first.value;
		},

		/**
		 * Writes a value the way a visitor would, so HubSpot's own state follows, and returns what the
		 * field holds afterwards. A value the field has no option for leaves it unchanged.
		 */
		write(inst, f, value) {
			const [first] = f.controls;

			// HubSpot toggles an option on each input event, so an event is only sent for a change.
			const check = (control, on) => {
				if (control.checked === on) return;
				control.checked = on;
				input(control);
			};

			if (first.type === 'radio') {
				for (const control of f.controls) {
					if (control.value === canon(value)) check(control, true);
				}
			} else if (first.type === 'checkbox') {
				const known = (option) => f.controls.some((control) => control.value === option);
				if (f.kind === 'multi' && !list(value).every(known)) return legacy.value(f);

				for (const control of f.controls) {
					check(control, f.kind === 'bool' ? TRUE.has(value) : list(value).includes(control.value));
				}
			} else if (first.tagName === 'SELECT') {
				// Setting a value a dropdown has no option for would empty it.
				if (![...first.options].some((option) => option.value === canon(value))) return legacy.value(f);
				first.value = canon(value);
				input(first);
			} else if (f.kind === 'multi') {
				// A hidden multiple-checkbox field: one input event per option that changes.
				const now = list(first.value);
				const next = list(value);
				for (const option of new Set([...now, ...next])) {
					if (now.includes(option) === next.includes(option)) continue;
					first.value = option;
					input(first);
				}
			} else {
				// A phone field with a country picker submits a hidden input, but HubSpot listens to the
				// visible one.
				const phone = first.type === 'hidden' && first.closest('.hs-form-field')?.querySelector('input[type=tel]');
				const control = phone || first;
				control.value = canon(value);
				input(control);
			}

			return legacy.value(f);
		},
	};

	/* v4 forms ---------------------------------------------------------------------------------- */

	const DEVELOPER_SCRIPT = /hsforms\.net\/forms\/embed\/developer\/\d+\.js/;
	const EMBED_SCRIPT = /hsforms\.net\/forms\/embed\/\d+\.js/;

	/**
	 * Forms built in HubSpot's new editor, driven through HubSpot's HubSpotFormsV4 API. mode="modern"
	 * renders HubSpot's developer embed in the page, and mode="modern-iframe" its standard embed, in
	 * a cross-origin iframe.
	 */
	const v4 = {
		/**
		 * Loads the account's embed script. The developer script has no global to check, but it also
		 * renders embeds added after it loaded, so being on the page is enough.
		 */
		load({ mode, region, portal }) {
			if (mode === 'modern') {
				return load(`${host(region)}/forms/embed/developer/${portal}.js`, DEVELOPER_SCRIPT, () => onPage(DEVELOPER_SCRIPT));
			}
			return load(`${host(region)}/forms/embed/${portal}.js`, EMBED_SCRIPT, () => window.__HS__FORMS__EMBED__);
		},

		/**
		 * Adds HubSpot's embed element. HubSpot renders each embed element as it's added to the page,
		 * so it's added with its settings in place. The instance id ties HubSpot's events to this render.
		 */
		render(inst) {
			const inPage = inst.mode === 'modern';
			const embed = document.createElement('div');
			embed.className = inPage ? 'hs-form-html' : 'hs-form-frame';
			Object.assign(embed.dataset, {
				region: inst.region,
				formId: inst.formId,
				portalId: inst.portal,
				instanceId: inst.renderId,
			});
			if (inPage) embed.id = inst.renderId; // The developer embed takes its instance id from the element's id.
			inst.element.replaceChildren(embed);
		},

		/** Adds the business unit to the form's submission. */
		ready(inst) {
			if (inst.businessUnit) inst.form.setExtraSubmissionMetadata({ businessUnitId: inst.businessUnit });
		},

		/**
		 * The value of each field, by field id, from HubSpot's getFormFieldValues(). HubSpot doesn't
		 * report field types, but multi-value fields return lists.
		 */
		read(inst, fields) {
			const values = new Map(fields.map(({ name, value }) => [name, value]));
			for (const [id, value] of values) {
				if (!inst.fields.has(id)) inst.fields.set(id, field(id, Array.isArray(value) ? 'multi' : 'text'));
			}
			return values;
		},

		/** Writes a value. HubSpot takes lists for multi-value fields and booleans for single checkboxes. */
		write(inst, f, value) {
			if (typeof value === 'boolean') f.kind = 'bool';

			let sent = canon(value);
			if (f.kind === 'multi') sent = list(value);
			if (f.kind === 'bool') sent = TRUE.has(value);
			inst.form.setFieldValue(f.id, sent);
		},
	};

	/* Instances --------------------------------------------------------------------------------- */

	/** Every instance by key, including instances whose container isn't on the page right now. */
	const instances = new Map();

	/** The instance rendered in each container. */
	const mounted = new WeakMap();

	/** The key each container was given, so a container that's moved keeps its instance and values. */
	const keys = new WeakMap();

	/** Numbers automatic keys and renders. */
	let counter = 0;

	/** The instances whose containers are on the page. */
	const onPageInstances = () => [...instances.values()].filter((inst) => inst.element);

	/**
	 * One copy of a form on the page. It's identified by its key, and outlives its container: a form
	 * in a modal keeps its instance and values while the modal is closed.
	 */
	class Instance {
		/** 'unmounted', 'loading', 'ready', 'submitted' or 'error'. */
		state = 'unmounted';

		/** The container, while it's on the page. */
		element = null;

		/** The rendered form: the <form> element for legacy forms, HubSpot's form object for v4. */
		form = null;

		/** The fields seen so far in this render, by field id. */
		fields = new Map();

		constructor(key) {
			this.key = key;
		}

		/** The adapter for this instance's kind of form. */
		get #adapter() {
			return this.mode === 'legacy' ? legacy : v4;
		}

		/** Sets values for this instance. */
		set(values, options) {
			return setValues('instance', this.key, values, options);
		}

		/** The values stored for this instance. */
		values() {
			return scopeValues('instance', this.key);
		}

		/** Renders the form again, keeping its values. HubSpot forms submit once, so this shows a fresh one. */
		reload() {
			if (this.element) this.#render();
		}

		/**
		 * A field's current value, read afresh, by property name or qualified name.
		 *
		 * @returns {Promise<string|undefined>} Undefined when the form isn't ready or has no such field.
		 */
		async get(property) {
			if (!this.form) return undefined;
			await this.#transact(() => null);
			return [...this.fields.values()].find((f) => f.id === property || f.name === property)?.current;
		}

		/** A snapshot for debugging. Legacy values are read afresh; v4 values are as of the last read. */
		inspect() {
			if (this.form && this.#adapter === legacy) this.#apply(() => null, legacy.read(this));

			const fields = Object.fromEntries([...this.fields.values()].map((f) => [f.id, {
				value: f.current,
				hubspot: f.initial,
				written: f.written,
				want: this.#resolve(f),
				last: f.last,
			}]));

			return { key: this.key, form: this.formId, mode: this.mode, state: this.state, fields };
		}

		/** Takes over a container and renders the form in it. */
		attach(element, config) {
			const { form_id: formId, portal_id: portal, region, mode, business_unit_id: businessUnit, options } = config;
			Object.assign(this, { element, formId, portal, region, mode, businessUnit, options: options ?? {} });
			mounted.set(element, this);
			element.replaceChildren(); // Removes what an earlier render or a copied container left behind.
			this.#render();
		}

		/** Lets go of a container that left the page. The instance keeps its values. */
		detach() {
			mounted.delete(this.element);
			Object.assign(this, { element: null, form: null, renderId: null, state: 'unmounted' });
		}

		/**
		 * Applies the values of one set() call to the fields it names. The most specific scope still
		 * decides each field. Where the call's own scope decides, the call applies its own value and
		 * force, even if a later call has stored another since: calls apply in the order they were made.
		 * A stored force, from an attribute or an earlier forced call, only counts when this call forces
		 * too, so an unforced call never replaces what the visitor typed.
		 *
		 * @param {string}             scopeName The scope the call set values in.
		 * @param {Map<string,object>} entries   The call's values, as stored, by property.
		 * @param {boolean}            force     Whether the call forces.
		 */
		sync(scopeName, entries, force) {
			const { form } = this;
			const matched = new Set();

			const pick = (f) => {
				const name = [f.id, f.name].find((n) => entries.has(n));
				if (!name) return null;
				matched.add(name);
				const entry = this.#resolve(f);
				const own = entry?.scope === scopeName && entry.key === name ? entries.get(name) : entry;
				return own && { ...own, force: own.force && force };
			};

			return this.#transact(pick).then((result) => {
				// Removed or rendered again meanwhile: the values apply when the form is ready again.
				if (this.form !== form) return outcome(this.key, { pending: [...entries.keys()] });

				for (const name of entries.keys()) {
					if (!matched.has(name)) result.skipped[name] = 'no-field';
				}
				if (Object.keys(result.applied).length) this.#emit('apply', result);
				return result;
			});
		}

		/** Called when HubSpot has rendered the form: applies the stored values and announces it. */
		ready(form) {
			if (this.state !== 'loading' || !form) return; // HubSpot can announce a form twice.

			// From here on, set() calls queue behind this first fill.
			Object.assign(this, { form, state: 'ready' });
			this.#adapter.ready?.(this);

			this.#transact((f) => this.#resolve(f)).then(
				(result) => this.form === form && this.#emit('ready', result),
				(error) => this.form === form && this.#fail(error),
			);
		}

		/** Called when HubSpot accepted a submission. Legacy forms report the submitted values. */
		submitted(values) {
			this.state = 'submitted';
			this.#emit('submitted', { values });
		}

		/** Renders the form. Callbacks from an earlier render are ignored. */
		#render() {
			const id = `${this.key}-${++counter}`;
			Object.assign(this, { renderId: id, state: 'loading', form: null, fields: new Map() });

			const current = (callback) => (value) => this.renderId === id && callback.call(this, value);
			const adapter = this.#adapter;

			adapter.load(this)
				.then(current(() => adapter.render(this, current(this.ready), current(this.submitted), current(this.#fail))))
				.catch(current(this.#fail));
		}

		/**
		 * The value that applies to a field: from the instance, then the form, then the global scope.
		 * Within a scope, a qualified name (0-1/email) comes before a bare one (email).
		 */
		#resolve(f) {
			for (const [name, id] of [['instance', this.key], ['form', this.formId], ['global', '']]) {
				const values = scope(name, id);
				const key = values.has(f.id) ? f.id : f.name;
				if (values.has(key)) return { ...values.get(key), scope: name, key };
			}
			return null;
		}

		/**
		 * Reads the fields, then writes the values `pick` returns, for the render that asked. Legacy
		 * forms do this at once. v4 forms wait their turn, and after writing give HubSpot a moment to
		 * take the values before the next call reads them.
		 */
		#transact(pick) {
			const { form } = this;

			if (this.#adapter === legacy) {
				return Promise.resolve().then(() => (this.form === form ? this.#apply(pick, legacy.read(this)) : outcome(this.key)));
			}

			return serial(async () => {
				if (this.form !== form) return outcome(this.key);
				const fields = await form.getFormFieldValues();
				if (this.form !== form) return outcome(this.key);

				const result = this.#apply(pick, v4.read(this, fields));
				if (Object.keys(result.applied).length) await new Promise((resolve) => setTimeout(resolve));
				return result;
			});
		}

		/**
		 * Writes the value `pick` returns for each field the form shows, where decide() allows it.
		 *
		 * @param {Function} pick    Returns the value to write to a field, or null to leave it alone.
		 * @param {Map}      current The value each field holds, by field id.
		 * @returns {{ key: string, applied: object, skipped: object }}
		 */
		#apply(pick, current) {
			const result = outcome(this.key);

			for (const f of this.fields.values()) {
				if (!current.has(f.id)) continue; // Not shown right now.

				f.current = canon(current.get(f.id), f.kind);
				f.initial ??= f.current;

				const entry = pick(f);
				if (!entry) continue;

				const want = canon(entry.value, f.kind);
				f.last = decide(f, want, entry.force);
				if (f.last !== 'write') {
					result.skipped[f.id] = f.last;
					continue;
				}

				const before = f.current;
				const after = this.#adapter.write(this, f, entry.value); // Legacy forms report what the field holds now.
				f.current = canon(after ?? entry.value, f.kind);

				// HubSpot refused the value, or the field has no such option.
				if (f.current === before || (f.current === '' && want !== '')) {
					result.skipped[f.id] = f.last = 'rejected';
					continue;
				}

				f.written = f.current;
				f.last = 'applied';
				result.applied[f.id] = entry.value;
			}

			return result;
		}

		/** Handles a failed render. A new-editor form placed in legacy mode is rendered again as v4. */
		#fail(error) {
			if (error === 'NON_EMBEDDABLE_EDITOR2_FORM') {
				console.warn('[wp_hubspot_forms]', `Form ${this.formId} was built in HubSpot's new editor; set mode="modern-iframe" or "modern" to skip this extra render.`);
				this.mode = 'modern-iframe';
				return this.reload();
			}

			this.state = 'error';
			console.warn('[wp_hubspot_forms]', this.key, error);
		}

		/** Dispatches a constructivemedia/hubspot/forms/* event from the container. */
		#emit(type, detail) {
			log(type, this.key, detail);
			this.element?.dispatchEvent(new CustomEvent(`constructivemedia/hubspot/forms/${type}`, { bubbles: true, detail: { instance: this, ...detail } }));
		}
	}

	/** The instance with this key, created on first use. */
	const instance = (key) => {
		if (!instances.has(key)) instances.set(key, new Instance(key));
		return instances.get(key);
	};

	/**
	 * Stores a container's values from PHP. Global and form values are the same in every container
	 * of a page, so the first copy is kept. Instance values come from the attributes: they replace
	 * the instance's earlier PHP values, and are forced. Values set from JavaScript always win.
	 */
	const seed = ({ form_id: formId, scopes }, key) => {
		const put = (entries, values, force = false) => {
			for (const [property, value] of Object.entries(values ?? {})) {
				if (!entries.has(property)) entries.set(property, { value, force, source: 'php' });
			}
		};

		const own = scope('instance', key);
		for (const [property, entry] of own) {
			if (entry.source === 'php') own.delete(property);
		}

		put(scope('global'), scopes?.global);
		put(scope('form', formId), scopes?.form);
		put(own, scopes?.instance, true);
	};

	/** Gives a container its instance and renders the form in it. Invalid settings are ignored. */
	const mount = (element) => {
		if (mounted.has(element) || !element.isConnected) return;

		let config;
		try {
			config = JSON.parse(element.dataset.wphsf);
		} catch {}

		const valid = config && Object.entries(VALID).every(([name, pattern]) => pattern.test(config[name] ?? ''));
		if (!valid) return log('Ignored invalid form settings', element);

		// A container that comes back keeps the key it had, even one it was given in place of a taken key.
		let key = keys.get(element) || config.instance || `hsf-${++counter}`;
		if (instances.get(key)?.element) {
			log(`Instance key "${key}" is taken`, element);
			key = `hsf-${++counter}`;
		}

		keys.set(element, key);
		seed(config, key);
		instance(key).attach(element, config);
	};

	/**
	 * Stores values in a scope, then applies them to the forms it covers that are ready. Forms that
	 * aren't ready yet get them when they are.
	 *
	 * @returns {Promise<object[]>} One outcome per form the scope covers.
	 */
	const setValues = (name, id, values = {}, { force = false } = {}) => {
		const entries = new Map();
		for (const [key, value] of Object.entries(values)) {
			if (value !== undefined) entries.set(key, { value, force, source: 'js' }); // undefined: not provided.
		}
		for (const [key, entry] of entries) scope(name, id).set(key, entry);

		const covered = onPageInstances().filter((inst) => {
			if (name === 'global') return true;
			return (name === 'form' ? inst.formId : inst.key) === id;
		});

		return Promise.all(covered.map((inst) => (inst.state === 'ready'
			? inst.sync(name, entries, force)
			: outcome(inst.key, { pending: [...entries.keys()] }))));
	};

	/* API --------------------------------------------------------------------------------------- */

	const api = {
		/** Set to true to log activity to the console. */
		debug: false,

		/** Sets values for every form. */
		set: (values, options) => setValues('global', '', values, options),

		/** The values stored for every form. */
		values: () => scopeValues('global', ''),

		/** The scope of one form, for every copy of it on the page. */
		form(formId) {
			const id = String(formId).toLowerCase();
			return {
				set: (values, options) => setValues('form', id, values, options),
				values: () => scopeValues('form', id),
			};
		},

		/**
		 * One copy of a form. A key always returns an instance, even before the form renders. An element
		 * returns the instance it belongs to, or null.
		 */
		instance: (ref) => (ref instanceof Element ? mounted.get(ref.closest(SELECTOR)) ?? null : instance(String(ref))),

		/** The instances currently on the page. */
		instances: onPageInstances,

		/** Calls the callback with the API. Replaces the queue's push() once this script has loaded. */
		push: (callback) => callback(api),
	};

	// v4 forms report their events with the instance id this script gave their embed.
	const rendered = (event) => [...instances.values()].find((inst) => inst.renderId && inst.renderId === event.detail?.instanceId);
	addEventListener('hs-form-event:on-ready', (event) => rendered(event)?.ready(window.HubSpotFormsV4.getFormFromEvent(event)));
	addEventListener('hs-form-event:on-submission:success', (event) => rendered(event)?.submitted());

	window.wp_hubspot_forms = api;
	(queued ?? []).forEach(api.push);

	/** The containers in a node: the node itself, or those inside it. */
	const containers = (node) => {
		if (node.nodeType !== Node.ELEMENT_NODE) return [];
		return node.matches(SELECTOR) ? [node] : node.querySelectorAll(SELECTOR);
	};

	/**
	 * Renders the forms on the page, and watches for forms that come and go, in modals or AJAX
	 * content. A removed container lets go of its form and an added one renders; a move does both.
	 */
	const start = () => {
		new MutationObserver((records) => {
			for (const { removedNodes } of records) {
				for (const node of removedNodes) {
					for (const element of containers(node)) {
						if (mounted.get(element)?.element === element) mounted.get(element).detach();
					}
				}
			}
			for (const { addedNodes } of records) {
				for (const node of addedNodes) containers(node).forEach(mount);
			}
		}).observe(document.documentElement, { childList: true, subtree: true });

		document.querySelectorAll(SELECTOR).forEach(mount);
	};

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
	else start();
})();
