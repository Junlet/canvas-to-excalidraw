/**
 * Makes a Canvas document reach its file, and proves that it did.
 *
 * WHY THIS EXISTS
 * ---------------
 * Obsidian's Canvas view saves on a **2-second debounce**, and `requestSave()`
 * returns immediately, so awaiting it means nothing:
 *
 *     var i = debounce(view.save.bind(view), 2000);
 *     view.requestSave = function () { view.dirty = true; i() };   // -> undefined
 *
 * Its `save()` also bails out silently when another save is in flight, when the
 * payload equals `lastSavedData`, or while the file is being deleted. Any of
 * those leaves the Canvas correct on screen but **unchanged on disk** -- so
 * nothing that watches the vault (sync, backup, indexers) ever sees the edit,
 * and the file is only written later, when the user happens to touch the
 * Canvas again.
 *
 * That is exactly the "moved images into Excalidraw, nothing synced until I
 * nudged a node" report: the drawing file was created (so it synced), the
 * `.canvas` was never rewritten until a human nudged it.
 *
 * WHAT THIS DOES INSTEAD
 * ----------------------
 *   1. `requestSave()` is still called, so Obsidian's dirty flag and undo
 *      history stay correct;
 *   2. the view's `saveImmediately()` then writes **now**;
 *   3. the file is re-read until the change is visible (a marker string, or
 *      simply any difference from the content read before saving);
 *   4. if it never appears, the view's own serialisation (`getViewData()`) is
 *      written through the vault -- byte-for-byte what Obsidian would have
 *      saved -- and verified once more.
 *
 * Nothing here throws: a Canvas that cannot be confirmed is reported once in
 * the console rather than failing an otherwise successful conversion.
 */

import type { TFile } from "obsidian";

/** How many times the file is re-read while waiting for the write to land. */
const FLUSH_ATTEMPTS = 12;

/** Delay between those reads, in milliseconds (~1.8s in total). */
const FLUSH_INTERVAL_MS = 150;

/** The parts of the Canvas file view this module needs. */
export interface CanvasViewLike {
	/** The file the view is bound to; absent for a never-saved Canvas. */
	file?: TFile | null;
	/** Writes the current view data now, when the view is dirty. */
	saveImmediately?(): Promise<void> | void;
	/** Obsidian's own serialisation of the view. */
	getViewData?(): unknown;
}

/** Everything a flush needs. */
export interface FlushTarget {
	/** The owning file view, reached through the Canvas object. */
	view?: CanvasViewLike | null;
	/** Vault access, so this module needs no Obsidian import at runtime. */
	vault: {
		read(file: TFile): Promise<string>;
		modify(file: TFile, data: string): Promise<void>;
	};
	/** Log prefix, so each plugin's messages stay distinguishable. */
	logPrefix: string;
}

/**
 * Resolves after a delay.
 *
 * @param ms - Milliseconds to wait.
 * @returns A promise that settles after that delay.
 */
function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Re-reads the file until the change is visible.
 *
 * @param target - View and vault access.
 * @param marker - Text that must appear, when the caller knows one.
 * @param baseline - Content read before saving, used when there is no marker.
 * @param sleep - Delay implementation, injectable for tests.
 * @returns True once the change is confirmed on disk.
 */
async function waitForWrite(
	target: FlushTarget,
	file: TFile,
	marker: string | undefined,
	baseline: string | null,
	sleep: (ms: number) => Promise<void>
): Promise<boolean> {
	for (let attempt = 0; attempt <= FLUSH_ATTEMPTS; attempt += 1) {
		try {
			const text = await target.vault.read(file);
			if (marker ? text.includes(marker) : baseline !== null && text !== baseline) {
				return true;
			}
		} catch {
			// A file can be briefly unavailable while Obsidian rewrites it.
		}
		if (attempt === FLUSH_ATTEMPTS) break;
		await sleep(FLUSH_INTERVAL_MS);
	}
	return false;
}

/**
 * Forces the Canvas file to reflect the view, and verifies it.
 *
 * @param target - View and vault access.
 * @param marker - Optional text expected in the file once the write landed.
 *   Without one, any difference from the pre-save content counts as written.
 * @param sleep - Delay implementation, injectable for tests.
 * @returns True when the change was confirmed on disk.
 */
export async function flushCanvas(
	target: FlushTarget,
	marker?: string,
	sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<boolean> {
	const view = target.view;
	if (!view) return false;
	const file = view.file;

	// Read before asking for the save: this is both the baseline used when no
	// marker is given, and a cheap way to notice a file that cannot be read.
	let baseline: string | null = null;
	if (file) {
		try {
			baseline = await target.vault.read(file);
		} catch {
			baseline = null;
		}
	}

	// 1. Write now. `saveImmediately()` is a no-op unless the view is dirty,
	//    which the caller's `requestSave()` has already arranged.
	if (typeof view.saveImmediately === "function") {
		try {
			await view.saveImmediately();
		} catch (error) {
			console.error(
				target.logPrefix + "Canvas saveImmediately() failed",
				error
			);
		}
	}

	// Nothing to verify: the Canvas was never saved (no file) or the caller did
	// not ask for proof.
	if (!file) return false;
	if (await waitForWrite(target, file, marker, baseline, sleep)) return true;

	// 2. Last resort: write Obsidian's own serialisation ourselves. This is the
	//    same string the view would have written, so Obsidian's next load is
	//    unaffected -- it simply lands before the debounce does.
	const payload =
		typeof view.getViewData === "function" ? view.getViewData() : null;
	if (typeof payload !== "string") {
		console.warn(
			target.logPrefix +
				"Canvas change could not be confirmed on disk, and the view " +
				"exposes no serialisation to fall back on."
		);
		return false;
	}

	try {
		await target.vault.modify(file, payload);
	} catch (error) {
		console.error(
			target.logPrefix + "Canvas fallback write failed",
			error
		);
		return false;
	}

	if (await waitForWrite(target, file, marker, baseline, sleep)) return true;

	console.warn(
		target.logPrefix +
			"Canvas change still not visible on disk after a fallback write."
	);
	return false;
}
