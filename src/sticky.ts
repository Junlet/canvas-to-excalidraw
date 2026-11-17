/**
 * Sticky-note conversion for Canvas text cards.
 *
 * A text card becomes an Excalidraw **sticky note** -- a `stickynote` container
 * with a bound, auto-fitted label -- instead of a bare text element. Sticky
 * notes are Excalidraw's own concept for exactly this: a coloured card holding
 * a short piece of text.
 *
 * Everything here is pure so the geometry and colour rules can be tested
 * without Obsidian. The calls into ExcalidrawAutomate live in `excalidraw.ts`.
 */

import { lightenColour, resolveCanvasPresetColor } from "./colors";

/** Accepted values for the note-size rule. */
export const STICKY_SIZE_MODES = ["card", "fixed"];

/** Accepted values for the label alignment. */
export const STICKY_TEXT_ALIGNS = ["left", "center", "right"];

/** Accepted values for the note fill. */
export const STICKY_BACKGROUND_MODES = ["follow", "custom", "keep"];

/**
 * Smallest note this plugin will create.
 *
 * A Canvas card can be tiny (a one-line caption is often 100x40), and a sticky
 * note that small gets an unreadably shrunken label. The floor keeps every note
 * usable; the user can still resize it afterwards.
 */
export const MIN_STICKY_WIDTH = 120;

/** Smallest note height; see {@link MIN_STICKY_WIDTH}. */
export const MIN_STICKY_HEIGHT = 80;

/**
 * How far a "follow the card colour" fill is mixed towards white.
 *
 * Canvas preset colours are saturated. At 0.78 the result is the pastel tint
 * Obsidian itself paints on a coloured card, so dark label text stays readable.
 */
const FOLLOW_CARD_TINT = 0.78;

/**
 * Reports whether a value is a recognised size rule.
 *
 * @param value - Candidate value.
 * @returns True for `"card"` or `"fixed"`.
 */
export function isStickySizeMode(value: unknown): value is string {
	return typeof value === "string" && STICKY_SIZE_MODES.includes(value);
}

/**
 * Reports whether a value is a recognised label alignment.
 *
 * @param value - Candidate value.
 * @returns True for `"left"`, `"center"` or `"right"`.
 */
export function isStickyTextAlign(
	value: unknown
): value is "left" | "center" | "right" {
	return (
		typeof value === "string" &&
		STICKY_TEXT_ALIGNS.includes(value)
	);
}

/**
 * Reports whether a value is a recognised fill rule.
 *
 * @param value - Candidate value.
 * @returns True for `"follow"`, `"custom"` or `"keep"`.
 */
export function isStickyBackgroundMode(value: unknown): value is string {
	return (
		typeof value === "string" &&
		STICKY_BACKGROUND_MODES.includes(value)
	);
}

/** What the caller reads from the plugin's settings. */
export interface StickyNoteOptions {
	/** `"card"` (follow the Canvas card's box) or `"fixed"`. */
	sizeMode: string;
	/** Note width, used when {@link sizeMode} is `"fixed"`. */
	width: number;
	/** Note height, used when {@link sizeMode} is `"fixed"`. */
	height: number;
	/** Maximum label font size; Excalidraw shrinks it further to fit. */
	fontSize: number;
	/** `"left"` | `"center"` | `"right"`. */
	textAlign: string;
	/** `"follow"` (card colour) | `"custom"` | `"keep"`. */
	backgroundMode: string;
	/** Fill used when {@link backgroundMode} is `"custom"`. */
	backgroundColor: string;
}

/** Geometry handed to `addStickyNote()`. */
export interface StickyFormat {
	width: number;
	height: number;
	fontSize: number;
	textAlign: "left" | "center" | "right";
}

/**
 * Coerces a number, falling back to a sentinel when it is unusable.
 *
 * @param value - Candidate number.
 * @param fallback - Value used when the input is not finite.
 * @returns A finite number.
 */
function finite(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
}

/**
 * Computes a note's size and label formatting.
 *
 * Both size rules are clamped to the floors, so no card can produce an
 * unusable note; an unknown alignment falls back to `"left"` rather than being
 * passed through to Excalidraw.
 *
 * @param options - Sticky-note settings.
 * @param cardWidth - The Canvas node's width, used by the `"card"` rule.
 * @param cardHeight - The Canvas node's height, used by the `"card"` rule.
 * @returns Size and label formatting for `addStickyNote()`.
 */
export function buildStickyFormat(
	options: StickyNoteOptions,
	cardWidth: number,
	cardHeight: number
): StickyFormat {
	const useCard = options.sizeMode === "card";
	const width = useCard ? cardWidth : options.width;
	const height = useCard ? cardHeight : options.height;

	return {
		width: Math.max(MIN_STICKY_WIDTH, Math.round(finite(width, 0))),
		height: Math.max(MIN_STICKY_HEIGHT, Math.round(finite(height, 0))),
		fontSize: Math.max(8, Math.round(finite(options.fontSize, 20))),
		textAlign: isStickyTextAlign(options.textAlign)
			? options.textAlign
			: "left",
	};
}

/**
 * Decides the note's fill colour.
 *
 * `"follow"` mixes the card's preset colour towards white so the note keeps the
 * card's hue without becoming a saturated block; a card with no colour leaves
 * the fill alone, matching how the text path treats an uncoloured card.
 *
 * @param options - Sticky-note settings.
 * @param rawColor - The Canvas node's `color` field.
 * @param doc - Document to read CSS variables from.
 * @returns A concrete colour, or null to keep Excalidraw's default fill.
 */
export function resolveStickyBackground(
	options: StickyNoteOptions,
	rawColor: unknown,
	doc?: Document
): string | null {
	if (options.backgroundMode === "keep") return null;
	if (options.backgroundMode === "custom") {
		return options.backgroundColor.trim() || null;
	}
	const preset = resolveCanvasPresetColor(rawColor, doc);
	if (!preset) return null;
	return lightenColour(preset, FOLLOW_CARD_TINT) ?? preset;
}
