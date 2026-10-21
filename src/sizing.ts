/**
 * Geometry for pictures staged into a newly created drawing.
 *
 * Kept separate from `excalidraw.ts` so the scaling maths -- the part that is
 * easy to get wrong and needs no Obsidian to check -- can be tested on its own.
 *
 * TWO MULTIPLIERS, TWO JOBS
 * -------------------------
 * A picture's size in the drawing comes from the Canvas node's box, so a
 * drawing keeps the layout the user arranged on the Canvas. "Insertion size"
 * then multiplies that for pictures where enlarging is lossless: an image
 * element keeps the original bytes and Excalidraw re-renders them, so growing
 * it costs nothing. A rasterised note, PDF page or other drawing is a one-off
 * snapshot rendered at a fixed size, so it is never grown past that size -- the
 * user's multiplier cannot un-blur a snapshot.
 */

/** Smallest accepted insertion size, in percent. */
export const IMAGE_SCALE_MIN = 25;

/** Largest accepted insertion size, in percent. */
export const IMAGE_SCALE_MAX = 400;

/** What a new installation gets: the Canvas node's own box, unchanged. */
export const DEFAULT_IMAGE_SCALE = 100;

/** Slider step, in percent. */
export const IMAGE_SCALE_STEP = 5;

/**
 * Coerces a stored value into a usable percentage.
 *
 * Missing, non-numeric and out-of-range values all fall back to the shipped
 * default rather than being trusted, so a hand-edited `data.json` cannot ask
 * for a 4000% picture.
 *
 * @param value - Raw stored value.
 * @returns A whole percent between {@link IMAGE_SCALE_MIN} and
 *   {@link IMAGE_SCALE_MAX}.
 */
export function normalizeImageScale(value: unknown): number {
	const numeric =
		typeof value === "number" && Number.isFinite(value)
			? value
			: DEFAULT_IMAGE_SCALE;
	return Math.min(
		IMAGE_SCALE_MAX,
		Math.max(IMAGE_SCALE_MIN, Math.round(numeric))
	);
}

/** How a staged picture should be sized. */
export interface FitOptions {
	/**
	 * Whether enlarging is lossless for this embed kind.
	 *
	 * True for pictures, false for rasterised notes, PDF pages and drawings.
	 */
	allowUpscale: boolean;
	/** Insertion-size multiplier; `1` leaves the Canvas node's box in charge. */
	scale: number;
}

/**
 * Computes the size a staged picture should take.
 *
 * `addImage(..., scale = false)` stages the picture at its natural pixel size,
 * so the element's current `width`/`height` *are* the natural dimensions. The
 * picture is fitted into the Canvas node's box while keeping its aspect ratio
 * (a node's box can be an arbitrary shape), then multiplied by the user's
 * insertion size if enlarging is lossless.
 *
 * @param naturalWidth - The picture's own width, in pixels.
 * @param naturalHeight - The picture's own height, in pixels.
 * @param boxWidth - Target width, from the Canvas node.
 * @param boxHeight - Target height, from the Canvas node.
 * @param options - Whether enlarging is allowed and by how much.
 * @returns The size to apply, or `null` when the inputs are unusable.
 */
export function fitSize(
	naturalWidth: number,
	naturalHeight: number,
	boxWidth: number,
	boxHeight: number,
	options: FitOptions
): { width: number; height: number } | null {
	if (!(naturalWidth > 0) || !(naturalHeight > 0)) return null;
	if (!(boxWidth > 0) || !(boxHeight > 0)) return null;

	let ratio = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
	if (options.allowUpscale) {
		ratio *= options.scale > 0 ? options.scale : 1;
	} else {
		ratio = Math.min(ratio, 1);
	}
	if (!Number.isFinite(ratio) || ratio <= 0) return null;

	return { width: naturalWidth * ratio, height: naturalHeight * ratio };
}
