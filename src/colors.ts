/**
 * Canvas node colour handling.
 *
 * Obsidian stores a text card's colour as a *preset index* (1-6) on the node's
 * `color` field. The index-to-colour mapping is fixed by Obsidian's own
 * stylesheet:
 *
 *   --canvas-color-1: var(--color-red);      --canvas-color-4: var(--color-green);
 *   --canvas-color-2: var(--color-orange);   --canvas-color-5: var(--color-cyan);
 *   --canvas-color-3: var(--color-yellow);   --canvas-color-6: var(--color-purple);
 *
 * Those variables are read live, so the colour handed to Excalidraw matches
 * whatever theme the user is actually looking at, including community themes
 * that redefine the palette. The constants below are only a fallback for the
 * (unlikely) case where the variables cannot be read; they are Obsidian's
 * *light* theme values, chosen because they stay legible on Excalidraw's
 * default white canvas.
 *
 * A node with no `color` field is left alone -- that is Canvas's "default"
 * appearance, and Excalidraw's own default is the right counterpart.
 */

/** How a Canvas card colour is carried into Excalidraw. */
export type TextColorMode = "text" | "background" | "ignore";

/** Prefix of Obsidian's per-preset CSS variables. */
const CANVAS_COLOR_VARIABLE_PREFIX = "--canvas-color-";

/** How many presets Obsidian's Canvas colour picker offers. */
const CANVAS_PRESET_COUNT = 6;

/**
 * Obsidian light-theme palette, indexed by `preset - 1`.
 * Fallback only; the live CSS variables take precedence.
 */
const FALLBACK_PALETTE = [
	"#e93147",
	"#ec7500",
	"#e0ac00",
	"#08b94e",
	"#00bfbc",
	"#7852ee",
];

/** A CSS colour value that means "no fill". */
const TRANSPARENT = "transparent";

/**
 * Reports whether a value is a recognised text colour mode.
 *
 * @param value - Candidate value.
 * @returns True for `"text"`, `"background"`, or `"ignore"`.
 */
export function isTextColorMode(value: unknown): value is TextColorMode {
	return value === "text" || value === "background" || value === "ignore";
}

/**
 * Coerces a Canvas `color` field into a 1-based preset index.
 *
 * Canvas writes the index as a number, but a string form is accepted too since
 * the field is not formally typed.
 *
 * @param raw - The node's `color` value.
 * @returns A preset index in `1..6`, or null when unset or unrecognised.
 */
export function normalizePresetIndex(raw: unknown): number | null {
	const parsed =
		typeof raw === "number"
			? raw
			: typeof raw === "string"
				? Number.parseInt(raw, 10)
				: Number.NaN;
	if (!Number.isInteger(parsed)) return null;
	if (parsed < 1 || parsed > CANVAS_PRESET_COUNT) return null;
	return parsed;
}

/**
 * Resolves a Canvas preset index to a concrete CSS colour.
 *
 * @param raw - The node's `color` value.
 * @param doc - Document to read CSS variables from; defaults to the main window.
 * @returns A CSS colour string, or null when the node carries no usable colour.
 */
export function resolveCanvasPresetColor(
	raw: unknown,
	doc?: Document
): string | null {
	const preset = normalizePresetIndex(raw);
	if (preset === null) return null;

	const ownerDocument = doc ?? (typeof document !== "undefined" ? document : undefined);
	if (ownerDocument?.body) {
		try {
			const value = ownerDocument.defaultView
				?.getComputedStyle(ownerDocument.body)
				.getPropertyValue(`${CANVAS_COLOR_VARIABLE_PREFIX}${preset}`)
				.trim();
			if (value) return value;
		} catch (error) {
			console.error(
				"[canvas-to-excalidraw] reading canvas colour variable failed",
				error
			);
		}
	}

	return FALLBACK_PALETTE[preset - 1] ?? null;
}

/**
 * Colour assignment for a single text element.
 * `null` means "keep the Excalidraw default".
 */
export interface TextColors {
	strokeColor: string | null;
	backgroundColor: string | null;
}

/**
 * Decides the colours for one text card.
 *
 * @param mode - The user's chosen mapping.
 * @param rawColor - The Canvas node's `color` field.
 * @param doc - Document to read CSS variables from.
 * @returns Colours to apply, with null for anything left at the default.
 */
export function resolveTextColors(
	mode: TextColorMode,
	rawColor: unknown,
	doc?: Document
): TextColors {
	if (mode === "ignore") {
		return { strokeColor: null, backgroundColor: null };
	}
	const color = resolveCanvasPresetColor(rawColor, doc);
	if (!color) {
		return { strokeColor: null, backgroundColor: null };
	}
	return mode === "background"
		? { strokeColor: null, backgroundColor: color }
		: { strokeColor: color, backgroundColor: TRANSPARENT };
}

/** Excalidraw's "no background" value, re-exported for callers resetting state. */
export const TRANSPARENT_BACKGROUND = TRANSPARENT;
