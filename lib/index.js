import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { patchSettingsSource, patchGeneralSource, patchConnectionSource, settingsNeedsPatch, generalNeedsPatch, connectionNeedsPatch } from "./patch.js";

//#region lib/index.js
/**
 * @diepxuan/dsh-zero-trust — zero-trust remote access layer for the DSH web
 * GUI (host half).
 *
 * Mounted as a Cordis loader row by this bundle's `cordis.patch.yml`. On every
 * boot it re-applies the remote-access client patches to the installed UI
 * settings packages, so the fix survives DSH upgrades without manual seds:
 *
 * - `@deepseek-ai/dsh-client-ui-settings`      — mirror scope pinned to "host"
 * - `@deepseek-ai/dsh-client-ui-settings-general` — document store always on
 * - `@deepseek-ai/dsh-client-connection`       — Origin fence accepts trusted-host authorities
 *
 * The web runtime serves each client bundle straight from disk per request,
 * so a patched file takes effect on the next browser refresh with no restart.
 * The client-connection patch is host-side code, so it needs one DSH restart.
 */

const TARGETS = [
	{
		pkg: "@deepseek-ai/dsh-client-ui-settings",
		client: "lib/client.js",
		needs: settingsNeedsPatch,
		transform: patchSettingsSource,
		label: "ui-settings scope gates"
	},
	{
		pkg: "@deepseek-ai/dsh-client-ui-settings-general",
		client: "lib/client.js",
		needs: generalNeedsPatch,
		transform: patchGeneralSource,
		label: "ui-settings-general document-store gate"
	},
	{
		pkg: "@deepseek-ai/dsh-client-connection",
		client: "lib/index.js",
		needs: connectionNeedsPatch,
		transform: patchConnectionSource,
		label: "client-connection Origin fence gates"
	}
];

/** Locate one target package's client bundle across the known anchors. */
function resolveTargetClient(pkg, client) {
	const candidates = [];
	const home = process.env.DSH_HOME;
	if (home !== void 0 && home !== "") candidates.push(join(home, "profiles", "node_modules", pkg, client));
	try {
		candidates.push(createRequire(import.meta.url).resolve(`${pkg}/package.json`, { paths: [process.cwd()] }).replace(/package\.json$/, client));
	} catch {}
	candidates.push(join(dirname(import.meta.url.replace(/^file:\/\//, "")), "..", "..", "..", "..", pkg, client));
	for (const candidate of candidates) {
		if (candidate.includes("node_modules") && existsSync(candidate)) return candidate;
	}
	return void 0;
}

/** Apply every transform idempotently; returns a human-readable report line. */
function applyPatches() {
	const lines = [];
	for (const target of TARGETS) {
		const file = resolveTargetClient(target.pkg, target.client);
		if (file === void 0) {
			lines.push(`dsh-zero-trust: SKIP ${target.pkg} — package not found under any anchor`);
			continue;
		}
		const src = readFileSync(file, "utf8");
		if (!target.needs(src)) {
			lines.push(`dsh-zero-trust: OK   ${target.pkg} — already patched`);
			continue;
		}
		const { patched, count } = target.transform(src);
		writeFileSync(file, patched);
		lines.push(`dsh-zero-trust: PATCH ${target.pkg} — removed ${count} ${target.label}`);
	}
	return lines;
}

/**
 * Host plugin body: neutralize loopback-only client gates before use.
 * @returns report lines written to stderr (journald-visible).
 */
export function apply() {
	for (const line of applyPatches()) process.stderr.write(`${line}\n`);
}
//#endregion

//#region CLI entry — run standalone without mounting the bundle row
if (process.argv[1] !== void 0 && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	for (const line of applyPatches()) console.log(line);
}
//#endregion
