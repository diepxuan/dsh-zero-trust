//#region lib/patch.js
/**
 * Pure source transforms for the remote-access client patches.
 *
 * The stock DSH web client disables host-persisted settings for any
 * non-loopback browser origin (`connection.isLoopback` gates in
 * `@deepseek-ai/dsh-client-ui-settings` and
 * `@deepseek-ai/dsh-client-ui-settings-general`). Behind a zero-trust edge
 * (Cloudflare Access in front of a loopback-only bind) that pinning makes the
 * Settings UI report "settings are unavailable in this browser" even though
 * the request itself is authenticated at the edge.
 *
 * These transforms neutralize exactly those gates, plus the matching
 * server-side Origin fence in `@deepseek-ai/dsh-client-connection` (gates 4+5
 * below). They are idempotent: the
 * patterns no longer match patched sources, so re-running is a no-op.
 */

/** Gate 1 + 2 (ui-settings): mirror scope ternary collapses to "host". */
const SETTINGS_SCOPE_PATTERN = /connection\.isLoopback\s*\?\s*"host"\s*:\s*"memory"/g;

/**
 * Gate 3 (ui-settings-general): document store ternary drops the `void 0`
 * branch and keeps the store constructor arguments verbatim. The argument
 * list may nest one level of parens, hence the recursive fragment.
 */
const GENERAL_STORE_PATTERN = /connection\.isLoopback\s*\?\s*(new SettingsDocumentStore\((?:[^()]|\([^()]*\))*\))\s*:\s*void 0/g;

/**
 * Gate 4 (client-connection, host side): the browser-trust fence compares a
 * request's `Origin` against the (tunnel-rewritten) Host authority only, so
 * behind a zero-trust edge every browser call carries
 * `Origin: https://<public-domain>` while Host reads `127.0.0.1` — instant
 * 403 unless an edge Transform Rule strips the header. This transform teaches
 * the fence the declared `trustedHosts`: an Origin whose authority equals a
 * configured trusted-host entry passes, exactly the edge the deployment owns.
 */
const CONNECTION_ORIGIN_PATTERN = /try\s*\{\s*return new URL\(origin\)\.host === hostUrl\.host;\s*\}\s*catch\s*\{\s*return false;\s*\}/g;

/**
 * Gate 5 (client-connection, privileged plane): PRIVILEGED_METHODS calls the
 * same fence with an empty trust list, pinning settings/credentials to
 * loopback-same-origin. With gate 4 keyed on `trustedHosts`, the privileged
 * call site must receive the deployment list too, or those methods would
 * still require a stripped-Origin edge. Passing the list is strictly
 * narrower than the stripped-Origin status quo, where ANY marker-less
 * request passed.
 */
const CONNECTION_PRIVILEGED_PATTERN = /PRIVILEGED_METHODS\.has\(method\) && !isTrustedApiRequest\(request, \[\]\)/g;

/**
 * Patch the ui-settings client bundle source.
 * @param src - original file content.
 * @returns {patched, count} — count is the number of gates removed.
 */
export function patchSettingsSource(src) {
	let count = 0;
	const patched = src.replace(SETTINGS_SCOPE_PATTERN, () => {
		count += 1;
		return '"host"';
	});
	return { patched, count };
}

/**
 * Patch the ui-settings-general client bundle source.
 * @param src - original file content.
 * @returns {patched, count} — count is the number of gates removed.
 */
export function patchGeneralSource(src) {
	let count = 0;
	const patched = src.replace(GENERAL_STORE_PATTERN, (_match, store) => {
		count += 1;
		return store;
	});
	return { patched, count };
}

/**
 * Patch the client-connection host bundle source.
 * @param src - original file content.
 * @returns {patched, count} — count is the number of gates removed.
 */
export function patchConnectionSource(src) {
	let count = 0;
	let patched = src.replace(CONNECTION_ORIGIN_PATTERN, () => {
		count += 1;
		return "try { return new URL(origin).host === hostUrl.host || isTrustedAuthority(new URL(origin), trustedHosts); } catch { return false; }";
	});
	patched = patched.replace(CONNECTION_PRIVILEGED_PATTERN, () => {
		count += 1;
		return "PRIVILEGED_METHODS.has(method) && !isTrustedApiRequest(request, trustedHosts)";
	});
	return { patched, count };
}

/** Whether a ui-settings source still contains any scope gate. */
export function settingsNeedsPatch(src) {
	return SETTINGS_SCOPE_PATTERN.test(src);
}

/** Whether a client-connection source still contains either server gate. */
export function connectionNeedsPatch(src) {
	CONNECTION_PRIVILEGED_PATTERN.lastIndex = 0;
	if (CONNECTION_PRIVILEGED_PATTERN.test(src)) return true;
	CONNECTION_ORIGIN_PATTERN.lastIndex = 0;
	return CONNECTION_ORIGIN_PATTERN.test(src);
}

/** Whether a ui-settings-general source still contains the store gate. */
export function generalNeedsPatch(src) {
	GENERAL_STORE_PATTERN.lastIndex = 0;
	return GENERAL_STORE_PATTERN.test(src);
}
//#endregion
