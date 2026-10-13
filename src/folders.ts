/**
 * Where newly created drawings are written.
 *
 * Two knobs the user controls:
 *   - a base folder (default `Z附件库/Excalidraw`, matching the Excalidraw
 *     plugin's own folder setting);
 *   - whether a `YYYY-MM` sub-folder is appended, so each month's drawings
 *     collect together instead of piling into one directory.
 *
 * The folder is resolved at creation time from the *local* clock. `Date`'s
 * local getters are used rather than `toISOString()`, which would file a
 * drawing created late on the 31st into the next month for anyone east of UTC.
 *
 * Everything here is pure so the month rollover, folder sanitising and the
 * empty-folder case can be tested without Obsidian.
 */

/** Default destination, matching the Excalidraw plugin's configured folder. */
export const DEFAULT_DRAWING_FOLDER = "Z附件库/Excalidraw";

/**
 * Formats a date as a `YYYY-MM` folder name.
 *
 * @param date - The moment the drawing is created.
 * @returns e.g. `"2026-10"`.
 */
export function formatMonthFolder(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

/**
 * Cleans a user-supplied vault folder path.
 *
 * Accepts backslashes, collapses repeated separators, drops `.` segments and
 * strips `..` so a typed path can never escape the vault. An empty result means
 * "the vault root", which callers treat as "no folder argument".
 *
 * @param raw - Whatever the user typed.
 * @returns A normalised vault-relative folder path, possibly empty.
 */
export function normalizeVaultFolder(raw: unknown): string {
	if (typeof raw !== "string") return "";
	const segments = raw
		.replace(/\\/gu, "/")
		.split("/")
		.map((segment) => segment.trim())
		.filter(
			(segment) =>
				segment.length > 0 && segment !== "." && segment !== ".."
		);
	return segments.join("/");
}

/**
 * Resolves the folder a new drawing should go into.
 *
 * @param baseFolder - The configured base folder (already sanitised or raw).
 * @param monthSubfolders - Whether to append the current month.
 * @param now - The creation moment; injectable for tests.
 * @returns A vault-relative folder path, or `""` for the vault root.
 */
export function resolveDrawingFolder(
	baseFolder: string,
	monthSubfolders: boolean,
	now: Date = new Date()
): string {
	const base = normalizeVaultFolder(baseFolder);
	if (!monthSubfolders) return base;
	const month = formatMonthFolder(now);
	return base ? `${base}/${month}` : month;
}

/**
 * Reports whether a value is a usable folder setting.
 *
 * Any string is accepted -- including the empty string, which means the vault
 * root -- so this only rejects non-strings.
 *
 * @param value - Candidate value.
 * @returns True when the value is a string.
 */
export function isFolderSetting(value: unknown): value is string {
	return typeof value === "string";
}
