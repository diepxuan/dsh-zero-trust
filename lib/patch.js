//#region lib/patch.js
/**
 * Pure source transforms for the remote-access client patches.
 *
 * DSH disables host-persisted settings for any non-loopback browser origin
 * (gates in `@deepseek-ai/dsh-client-ui-settings` and
 * `@deepseek-ai/dsh-client-ui-settings-general`). Behind a zero-trust edge
 * (Cloudflare Access in front of a loopback-only bind) that pinning makes
 * the Settings UI report "settings are unavailable in this browser" even
 * though the request itself is authenticated at the edge.
 *
 * These transforms neutralize exactly those two client gates. The server
 * side (`@deepseek-ai/dsh-client-connection`) carries no flag this plugin
 * has to remove today — Origin fence now accepts the declared
 * `trustedHosts`, and the privileged plane is gated by `browserAuth`, not
 * by an empty trust list. If a future DSH release re-introduces a loopback
 * pin or an Origin restriction here, add the new gate to this file.
 *
 * Patterns only match the right-hand side of the ternary (`? "host" : "memory"`
 * and `? new SettingsDocumentStore(...) : void 0`), so they survive the
 * upstream key rename `connection.isLoopback` → `ctx.remote.$host.isLoopback`.
 *
 * Idempotent: the patterns no longer match patched sources, so re-running is
 * a no-op.
 */

/**
 * Gate 1 (ui-settings): mirror scope ternary collapses to `"host"`. Anchors
 * only on the right-hand side — the left-hand expression (`connection.isLoopback`
 * or `ctx.remote.$host.isLoopback`) may change shape between DSH releases.
 */
const SETTINGS_SCOPE_PATTERN = /\?\s*"host"\s*:\s*"memory"/g;

/**
 * Gate 2 (ui-settings-general): document store ternary drops the `void 0`
 * branch and keeps the store constructor arguments verbatim. The argument
 * list may nest one level of parens, hence the recursive fragment.
 */
const GENERAL_STORE_PATTERN = /\?\s*(new SettingsDocumentStore\((?:[^()]|\([^()]*\))*\))\s*:\s*void 0/g;

/**
 * Patch the ui-settings client bundle source.
 * @param src - original file content.
 * @returns {patched, count} — count is the number of gates removed.
 */
export function patchSettingsSource(src) {
	let count = 0;
	const patched = src.replace(SETTINGS_SCOPE_PATTERN, () => {
		count += 1;
		return '? "host" : "host"';
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
		return `? ${store} : ${store}`;
	});
	return { patched, count };
}

/** Whether a ui-settings source still contains the scope gate. */
export function settingsNeedsPatch(src) {
	SETTINGS_SCOPE_PATTERN.lastIndex = 0;
	return SETTINGS_SCOPE_PATTERN.test(src);
}

/** Whether a ui-settings-general source still contains the store gate. */
export function generalNeedsPatch(src) {
	GENERAL_STORE_PATTERN.lastIndex = 0;
	return GENERAL_STORE_PATTERN.test(src);
}
//#endregion
