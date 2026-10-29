#!/usr/bin/env node
/**
 * Browser check against real HubSpot forms. Drives the sandbox page (tests/browser/sandbox.html, created
 * by `ddev setup`) in headless Chrome or Edge over the DevTools protocol. Node 22+, no dependencies.
 *
 *   node tests/browser/run.mjs [url]          BROWSER=/path/to/chrome picks the browser.
 *
 * The sandbox uses public HubSpot test forms from other portals, so they must never be submitted. The
 * browser blocks every POST to another site except HubSpot's validation lookups, and a test POST proves
 * the block works before the one check that clicks submit.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'https://wp-hubspot-forms.ddev.site/sandbox/';
const browser = [
	process.env.BROWSER,
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
].find((path) => path && existsSync(path));
if (!browser) {
	console.error('No Chrome or Edge found; set BROWSER=/path/to/browser.');
	process.exit(2);
}

/** Runs inside the page: clicks through the sandbox and checks each outcome. */
async function scenario() {
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const until = async (fn, ms = 30000) => {
		for (let spent = 0; spent < ms && !fn(); spent += 250) await wait(250);
		return fn();
	};
	const H = window.wp_hubspot_forms;
	const checks = [];
	const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });
	const field = (key, name) => H.instance(key).inspect().fields[`0-1/${name}`]?.value;
	// Legacy forms' internal state: what HubSpot would actually submit.
	const hubspot = (key, name) => window.HubSpotForms.getFormByInstanceId(H.instance(key).form.dataset.instanceId)._getState().fields[name]?.value;
	const click = async (selector) => {
		document.querySelector(selector).click();
		await wait(600);
	};

	check('four forms render', await until(() => H.instances().length === 4 && H.instances().every((f) => f.state === 'ready')), H.instances().map((f) => `${f.key}:${f.state}`));
	check('attribute applied (legacy)', field('header', 'gauserid') === 'U-HEADER');
	check('attribute applied (v4 iframe)', (await H.instance('v4-iframe').get('firstname')) === 'Grace');

	await click('[data-run="global"]');
	check('global value fills every copy', field('header', 'gaclientid') === 'G-123' && field('footer', 'gaclientid') === 'G-123');
	await click('[data-run="formFill"]');
	check('HubSpot default is protected', field('header', 'subscribersource_2') === 'Other Source');
	await click('[data-run="formForce"]');
	check('force replaces the default in both copies', field('header', 'subscribersource_2') === 'Web' && field('footer', 'subscribersource_2') === 'Web');
	await click('[data-run="headerOnly"]');
	check('instance value stays in its copy', field('header', 'gauserid') === 'H-1' && field('footer', 'gauserid') === '');
	await click('[data-run="typeThenGlobal"]');
	check('visitor input is protected', field('footer', 'email') === 'visitor@example.com' && field('header', 'email') === 'plugin@example.com');
	await click('[data-run="multi"]');
	check('hidden multi-checkbox', hubspot('header', 'content_language')?.join(';') === 'English;German');
	await click('[data-run="zero"]');
	check('0 is a value', field('footer', 'gatrackid') === '0');
	await click('[data-run="clear"]');
	check('null clears', field('footer', 'gatrackid') === '');
	await click('[data-run="v4Fill"]');
	check('v4 iframe fill', (await H.instance('v4-iframe').get('company')) === 'Acme');
	await click('[data-run="v4Force"]');
	check('v4 iframe force', (await H.instance('v4-iframe').get('firstname')) === 'Ada');
	await click('[data-run="v4Html"]');
	check('v4 developer embed', (await H.instance('v4-html').get('company')) === 'Kernel Co');
	check('HubSpot state holds the legacy values', hubspot('header', 'gaclientid') === 'G-123' && hubspot('header', 'subscribersource_2') === 'Web');

	await click('[data-run="reload"]');
	await until(() => H.instance('header').state === 'ready');
	check('reload re-applies stored values', field('header', 'gauserid') === 'H-1' && field('header', 'gaclientid') === 'G-123');

	for (const [listing, agent] of [['L-1001', 'alice@example.com'], ['L-2002', 'bob@example.com']]) {
		await click(`[data-listing="${listing}"]`);
		await until(() => H.instance('enquiry').state === 'ready');
		check(`modal carries ${listing}`, hubspot('enquiry', 'gauserid') === listing && hubspot('enquiry', 'gatrackid') === agent);
		await click('#enquiry [data-close]');
		check(`modal released after ${listing}`, H.instance('enquiry').state === 'unmounted');
	}

	await click('[data-run="deprecated"]');
	check('deprecated CMHubspotForms still works', field('footer', 'gatrackid') === 'OLD-API');
	check('HubSpot legacy library loaded once', [...document.scripts].filter((s) => /hsforms\.net\/forms\/(?:embed\/)?v2\.js/.test(s.src)).length === 1);

	// Edge cases, on containers added here so the checks above stay independent.
	const addForm = (instance, settings = {}) => {
		const base = JSON.parse(document.querySelector('[data-wphsf]').dataset.wphsf);
		const element = document.createElement('div');
		element.setAttribute('data-wphsf', JSON.stringify({ ...base, ...settings, instance, scopes: { global: {}, form: {}, instance: {} } }));
		document.body.append(element);
		return element;
	};
	const typeInto = (key, name, value) => {
		const control = H.instance(key).form.querySelector(`[name="${name}"]`);
		control.value = value;
		control.dispatchEvent(new Event('input', { bubbles: true })); // Stands in for the visitor typing.
	};

	const edge = addForm('edge');
	await wait(0);
	edge.remove();
	await wait(0);
	document.body.append(edge);
	await until(() => H.instance('edge').state === 'ready');
	await wait(1000);
	check('removed and reinserted while loading: one form, ready', edge.querySelectorAll('form').length === 1 && H.instance('edge').state === 'ready');

	H.instance('edge').reload();
	const [reloading] = await H.instance('edge').set({ gatrackid: 'AFTER-RELOAD' }, { force: true });
	await until(() => H.instance('edge').state === 'ready');
	await wait(300);
	check('set() straight after reload() applies once ready', reloading.pending?.includes('gatrackid') && field('edge', 'gatrackid') === 'AFTER-RELOAD' && hubspot('edge', 'gatrackid') === 'AFTER-RELOAD', reloading);

	const rapid = await Promise.all(['R1', 'R2', 'R3'].map((value) => H.instance('edge').set({ gatrackid: value })));
	check('rapid set() calls: the last value wins', field('edge', 'gatrackid') === 'R3' && hubspot('edge', 'gatrackid') === 'R3', rapid);

	typeInto('edge', 'email', 'visitor@example.com');
	const [[forced], [later]] = await Promise.all([
		H.instance('edge').set({ email: 'forced@example.com' }, { force: true }),
		H.instance('edge').set({ email: 'later@example.com' }),
	]);
	check('forced then unforced set() in one tick apply in order', forced.applied['0-1/email'] === 'forced@example.com' && later.applied['0-1/email'] === 'later@example.com' && field('edge', 'email') === 'later@example.com', [forced, later]);

	await H.instance('edge').set({ gatrackid: 'BARE', '0-1/gatrackid': 'QUALIFIED' }, { force: true });
	check('within a scope, a qualified name beats a bare one', field('edge', 'gatrackid') === 'QUALIFIED');
	await H.instance('edge').set({ gaclientid: 'INSTANCE-BARE' });
	await H.set({ '0-1/gaclientid': 'GLOBAL-QUALIFIED' });
	check('a more specific scope beats a qualified name', field('edge', 'gaclientid') === 'INSTANCE-BARE' && field('footer', 'gaclientid') === 'GLOBAL-QUALIFIED');

	const radio = 'blog_developer_changelog_29973821837_subscription';
	const [badRadio] = await H.instance('edge').set({ [radio]: 'hourly' }, { force: true });
	const [goodRadio] = await H.instance('edge').set({ [radio]: 'weekly' });
	check('a rejected option leaves the field open to a valid value', badRadio.skipped[`0-1/${radio}`] === 'rejected' && goodRadio.applied[`0-1/${radio}`] === 'weekly', [badRadio, goodRadio]);

	// A dropdown and checkboxes as HubSpot renders them, since the test form has neither.
	const inject = (html, type) => {
		const wrap = Object.assign(document.createElement('div'), { className: `hs-form-field hs-fieldtype-${type}`, innerHTML: html });
		H.instance('edge').form.append(wrap);
		return wrap;
	};
	const dropdown = inject('<select name="probe_select"><option value="">Pick</option><option value="a">A</option><option value="b" selected>B</option></select>', 'select');
	const boxes = inject('<input type="checkbox" name="probe_multi" value="x" checked><input type="checkbox" name="probe_multi" value="y">', 'checkbox');
	const [odd] = await H.instance('edge').set({ probe_select: 'zzz', probe_multi: ['y', 'nope'] }, { force: true });
	check('rejected dropdown and checkbox options keep the selection', odd.skipped['0-1/probe_select'] === 'rejected' && odd.skipped['0-1/probe_multi'] === 'rejected' && dropdown.firstChild.value === 'b' && boxes.querySelector('[value=x]').checked && !boxes.querySelector('[value=y]').checked, odd);
	const [valid] = await H.instance('edge').set({ probe_select: 'a', probe_multi: ['y'] }, { force: true });
	check('valid dropdown and checkbox options apply', valid.applied['0-1/probe_select'] === 'a' && dropdown.firstChild.value === 'a' && boxes.querySelector('[value=y]').checked && !boxes.querySelector('[value=x]').checked, valid);
	dropdown.remove();
	boxes.remove();

	const pending = H.instance('edge').set({ gauserid: 'WHILE-AWAY' });
	edge.remove();
	const [away] = await pending;
	document.body.append(edge);
	await until(() => H.instance('edge').state === 'ready');
	await wait(300);
	check('removed during set(): pending, applied on return', away.pending?.includes('gauserid') && field('edge', 'gauserid') === 'WHILE-AWAY', away);

	const first = addForm('dup');
	const second = addForm('dup');
	await until(() => H.instance(first)?.state === 'ready' && H.instance(second)?.state === 'ready');
	const secondKey = H.instance(second).key;
	await H.instance('dup').set({ gatrackid: 'FIRST-ONLY' });
	first.remove();
	second.remove();
	await wait(0);
	document.body.append(second);
	await until(() => H.instance(second)?.state === 'ready');
	await wait(300);
	check('duplicate key: a reinserted container keeps its own instance', secondKey !== 'dup' && H.instance(second).key === secondKey && H.instance(second).inspect().fields['0-1/gatrackid']?.value !== 'FIRST-ONLY', H.instance(second).key);
	document.body.append(first);
	await until(() => H.instance(first)?.state === 'ready');
	await wait(300);
	check('duplicate key: the original gets its key and values back', H.instance(first).key === 'dup' && H.instance(first).inspect().fields['0-1/gatrackid']?.value === 'FIRST-ONLY');

	// A legacy form with a business unit, submitted. The runner blocks the submission and reads it.
	const blocking = await fetch('https://forms.hsforms.com/wphsf-block-check', { method: 'POST', body: 'check' }).then(() => false, () => true);
	check('HubSpot submissions are blocked', blocking);
	if (blocking) {
		const unit = addForm('unit', { business_unit_id: '1234567' });
		await until(() => H.instance('unit').state === 'ready');
		await H.instance('unit').set({ email: 'wphsf.bu.probe@gmail.com', [radio]: 'weekly' }, { force: true });
		H.instance('unit').form.querySelector('[name=email]').dispatchEvent(new Event('blur', { bubbles: true })); // Starts HubSpot's email check.
		await wait(2500);
		H.instance('unit').form.querySelector('[type=submit], .hs-button').click();
		await wait(5000);
		unit.remove();
	}

	return checks;
}

/** Runs inside the sandbox with ?entry: waits for the forms, then reads the fields the visitor entry fills. */
async function entryFields() {
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const ready = () => window.wp_hubspot_forms?.instances?.().length === 4 && window.wp_hubspot_forms.instances().every((f) => f.state === 'ready');
	for (let spent = 0; spent < 30000 && !ready(); spent += 250) await wait(250);

	const H = window.wp_hubspot_forms;
	const field = (key, name) => H.instance(key).inspect().fields[`0-1/${name}`]?.value;
	return {
		source: field('footer', 'gatrackid'),
		medium: field('footer', 'gaclientid'),
		content: field('footer', 'subscribersource_2'),
		gclid: field('footer', 'gauserid'),
		attribute: field('header', 'gauserid'),
		url: field('footer', 'email'),
		referrer: await H.instance('v4-html').get('company'),
		promo: await H.instance('v4-html').get('firstname'),
	};
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = 9300 + (process.pid % 500);
const profile = mkdtempSync(join(tmpdir(), 'wphsf-'));
const child = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, '--ignore-certificate-errors', `--user-data-dir=${profile}`, 'about:blank']);

/** Closes the browser over the protocol: on Windows the process spawned here can be a launcher that already exited. */
const finish = async (code) => {
	try {
		const { webSocketDebuggerUrl } = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
		const browserSocket = new WebSocket(webSocketDebuggerUrl);
		await new Promise((resolve, reject) => {
			browserSocket.addEventListener('open', resolve);
			browserSocket.addEventListener('error', reject);
		});
		browserSocket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
		await new Promise((resolve) => browserSocket.addEventListener('close', resolve));
	} catch {
		child.kill();
	}
	await sleep(500); // Let it release the profile.
	try {
		rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	} catch {} // A leftover temp profile isn't worth failing the run.
	process.exit(code);
};

try {
	let targets;
	for (let i = 0; i < 50 && !targets; i++) {
		targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => sleep(200).then(() => undefined));
	}
	const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
	await new Promise((resolve) => socket.addEventListener('open', resolve));
	let id = 0;
	const pending = new Map();
	const blocked = []; // POSTs to HubSpot that were stopped: { url, body }.
	const send = (method, params = {}) => new Promise((resolve) => {
		pending.set(++id, resolve);
		socket.send(JSON.stringify({ id, method, params }));
	});

	/** HubSpot's field and email validation lookups, on any regional host. They don't submit anything. */
	const VALIDATION = /^https:\/\/forms(?:-[a-z0-9]+)?\.hsforms\.com\/(?:emailcheck|submissions-validation)\//;

	/** Lets every request through except POSTs to other sites, bar HubSpot's validation lookups. */
	const intercept = ({ requestId, request }) => {
		const local = new URL(request.url).origin === new URL(url).origin;
		if (request.method !== 'POST' || local || VALIDATION.test(request.url)) return send('Fetch.continueRequest', { requestId });
		const body = request.postData ?? (request.postDataEntries ?? []).map((entry) => Buffer.from(entry.bytes ?? '', 'base64').toString('utf8')).join('');
		blocked.push({ url: request.url, body });
		return send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
	};

	socket.addEventListener('message', ({ data }) => {
		const message = JSON.parse(data);
		pending.get(message.id)?.(message);
		if (message.method === 'Fetch.requestPaused') intercept(message.params);
		if (message.method === 'Runtime.exceptionThrown') console.error('page error:', message.params.exceptionDetails.exception?.description);
	});

	await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
	await send('Runtime.enable');
	await send('Page.navigate', { url });
	await sleep(1500);
	const { result } = await send('Runtime.evaluate', { expression: `(${scenario})()`, awaitPromise: true, returnByValue: true, timeout: 180000 });
	const checks = result?.result?.value;
	if (!Array.isArray(checks)) throw new Error(JSON.stringify(result));

	const submission = blocked.find((request) => request.url.includes('/submissions/'));
	checks.push({
		name: 'legacy submission carries the business unit',
		pass: Boolean(submission?.body.includes('"businessUnitId":"1234567"')),
		detail: submission?.url ?? 'no submission request',
	});

	// The visitor entry, over page views that each have their own address and referrer.
	const site = new URL(url).origin;
	const view = async (path, referrer) => {
		await send('Page.navigate', { url: site + path, ...(referrer && { referrer }) });
		await sleep(1500);
		const { result: read } = await send('Runtime.evaluate', { expression: `(${entryFields})()`, awaitPromise: true, returnByValue: true, timeout: 60000 });
		return read?.result?.value ?? {};
	};
	const entry = (name, pass, seen) => checks.push({ name: `entry: ${name}`, pass: Boolean(pass), detail: seen });

	/** Moves the stored entry's last page view back in time. */
	const age = (ms) => send('Runtime.evaluate', { expression: `(() => { const entry = JSON.parse(localStorage.getItem('wp_hubspot_forms_entry')); entry.seen -= ${ms}; localStorage.setItem('wp_hubspot_forms_entry', JSON.stringify(entry)); })()` });
	const HOUR = 3600 * 1000;

	// Each check fails if the rule it names breaks. Every page view starts with fresh forms, so a
	// field holds only what this view's entry wrote, or HubSpot's default.
	let seen = await view('/sandbox/?entry&utm_source=alpha&utm_medium=email');
	entry('a campaign link fills the mapped fields', seen.source === 'alpha' && seen.medium === 'email' && seen.url === `${site}/sandbox/?entry&utm_source=alpha&utm_medium=email`, seen);
	entry('a property the entry has no value for is left alone', seen.content === 'Other Source', seen);
	seen = await view('/sandbox/?entry', 'https://www.google.com/');
	entry('kept when another site sends the visitor back', seen.source === 'alpha' && seen.referrer === '', seen);
	seen = await view('/sandbox/?entry');
	entry('kept on a direct return', seen.source === 'alpha', seen);
	seen = await view('/sandbox/?entry&gclid=G-1', 'https://www.google.com/');
	entry('a click id starts a new entry, with the referring site', seen.gclid === 'G-1' && seen.source === '' && seen.referrer === 'https://www.google.com/', seen);
	entry('an attribute beats the entry', seen.attribute === 'U-HEADER', seen);
	seen = await view('/sandbox/?entry&utm_source=beta&utm_content=Web');
	entry('a new campaign replaces the whole entry', seen.source === 'beta' && seen.gclid === '' && seen.referrer === '', seen);
	entry('mapped values replace HubSpot defaults', seen.content === 'Web', seen);
	seen = await view('/sandbox/?entry&fbclid=F-1');
	entry('an unmapped click id starts a new entry', seen.source === '' && seen.url === `${site}/sandbox/?entry&fbclid=F-1`, seen);
	seen = await view('/sandbox/?entry&utm_id=U-1');
	entry('an unmapped utm_* parameter starts a new entry', seen.url === `${site}/sandbox/?entry&utm_id=U-1`, seen);
	seen = await view('/sandbox/?entry&promo=P-1');
	entry('a mapped parameter starts a new entry', seen.promo === 'P-1' && seen.url === `${site}/sandbox/?entry&promo=P-1`, seen);
	await age(2 * HOUR);
	await view('/sandbox/?entry', `${site}/news/`);
	await age(2 * HOUR);
	seen = await view('/sandbox/?entry', `${site}/news/`);
	entry('kept while the visitor returns within three hours of each page view', seen.promo === 'P-1', seen);
	await age(3 * HOUR + 60000);
	seen = await view('/sandbox/?entry', `${site}/news/`);
	entry('forgotten three hours after the last page view, and the site is no referrer', seen.promo === '' && seen.url === `${site}/sandbox/?entry` && seen.referrer === '', seen);

	for (const { name, pass, detail } of checks) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
	const failed = checks.filter((c) => !c.pass).length;
	console.log(`\n${checks.length - failed} passed, ${failed} failed`);
	finish(failed ? 1 : 0);
} catch (error) {
	console.error(error);
	finish(1);
}
