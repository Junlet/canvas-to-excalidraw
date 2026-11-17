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

/** `#rgb` or `#rrggbb`. */
const HEX_COLOUR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/iu;

/** `rgb(r, g, b)` / `rgba(r, g, b, a)`. */
const RGB_COLOUR = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/iu;

/**
 * Formats a 0-255 channel as two hex digits.
 *
 * @param value - Channel value.
 * @returns e.g. `"0a"`.
 */
function hexPair(value: number): string {
	return Math.max(0, Math.min(255, Math.round(value)))
		.toString(16)
		.padStart(2, "0");
}

/**
 * Mixes a colour towards white.
 *
 * Canvas preset colours are **saturated** -- they tint a whole card on the
 * Canvas. Filled straight onto a sticky note they would be loud and would
 * swallow the dark label text Excalidraw puts on a note. Mixing towards white
 * gives the pastel tint Obsidian itself applies to a coloured card, and stays a
 * *concrete* colour: Excalidraw paints fills through the canvas API, which
 * cannot evaluate `color-mix()`.
 *
 * @param colour - A `#rgb`, `#rrggbb` or `rgb()`/`rgba()` value.
 * @param ratio - How much white to mix in, `0` (unchanged) to `1` (white).
 * @returns The mixed colour as `#rrggbb`, or null when the input is not a
 *   colour this can parse -- the caller should then use the colour unchanged.
 */
export function lightenColour(colour: string, ratio: number): string | null {
	const trimmed = colour.trim();
	let red: number;
	let green: number;
	let blue: number;

	const hex = HEX_COLOUR.exec(trimmed);
	const rgb = hex ? null : RGB_COLOUR.exec(trimmed);

	if (hex) {
		const digits = hex[1];
		if (digits.length === 3) {
			red = Number.parseInt(digits[0] + digits[0], 16);
			green = Number.parseInt(digits[1] + digits[1], 16);
			blue = Number.parseInt(digits[2] + digits[2], 16);
		} else {
			red = Number.parseInt(digits.slice(0, 2), 16);
			green = Number.parseInt(digits.slice(2, 4), 16);
			blue = Number.parseInt(digits.slice(4, 6), 16);
		}
	} else if (rgb) {
		red = Number(rgb[1]);
		green = Number(rgb[2]);
		blue = Number(rgb[3]);
	} else {
		return null;
	}

	const amount = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
	const mix = (channel: number): number => channel + (255 - channel) * amount;
	return `#${hexPair(mix(red))}${hexPair(mix(green))}${hexPair(mix(blue))}`;
}
