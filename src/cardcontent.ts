/**
 * Markdown image embeds inside a Canvas text card.
 *
 * A Canvas text card is Markdown, so it can hold pictures inline:
 *
 *     # 示意图
 *     下面这张是边缘检测结果：
 *     ![[Z附件库/图片库/sobel.png]]
 *
 * An Excalidraw **text element cannot render an embed** -- the marker would be
 * copied verbatim and the drawing would literally read `![[sobel.png]]`. This
 * module pulls the embeds out so the caller can either drop them, keep a
 * readable file name in the text, or place the pictures as real image elements
 * next to the text.
 *
 * Pure by design: no Obsidian import, so the parsing can be tested on its own.
 */

/** Accepted values for the embed rule. */
export const EMBED_MODES = ["keep", "text", "image"];

/**
 * Reports whether a value is a recognised embed rule.
 *
 * @param value - Candidate value.
 * @returns True for `"keep"`, `"text"` or `"image"`.
 */
export function isEmbedMode(value: unknown): value is string {
	return typeof value === "string" && EMBED_MODES.includes(value);
}

/**
 * `![[target]]`, `![[target|resize]]`, `![[target#page=2]]`.
 *
 * Two variants on purpose. Removing an embed leaves a gap where it stood, so
 * the trimming variant swallows the spaces before it and an inline marker
 * disappears cleanly. The plain variant is used when the marker is *replaced*
 * (by a file name), because there the surrounding spaces are wanted.
 */
const WIKI_EMBED_TRIM = /[ \t]*!\[\[([^\]]+)\]\]/gu;
const WIKI_EMBED = /!\[\[([^\]]+)\]\]/gu;

/** `![alt](url)`, in the same two variants. */
const MARKDOWN_EMBED_TRIM = /[ \t]*!\[([^\]]*)\]\(([^)]+)\)/gu;
const MARKDOWN_EMBED = /!\[([^\]]*)\]\(([^)]+)\)/gu;

/** Path separator of a vault path or URL. */
const PATH_SEPARATOR = /[\\/]/u;

/** Optional `"title"` that Markdown allows after an image URL. */
const MARKDOWN_TITLE = /\s+["'][^"']*["']$/u;

/**
 * Strips the optional `"title"` from a Markdown image URL.
 *
 * `![x](a.png "caption")` refers to `a.png`; keeping the title would make the
 * vault lookup fail.
 *
 * @param url - The URL as written inside the parentheses.
 * @returns The URL without its title.
 */
function stripMarkdownTitle(url: string): string {
	return url.replace(MARKDOWN_TITLE, "").trim();
}

/**
 * Reduces an embed target to the name a reader would recognise.
 *
 * Vault paths and URLs both end in a file name; a subpath (`#page=2`) and any
 * query string are dropped, because neither belongs in a label.
 *
 * @param target - Raw target as written in the card.
 * @returns The file name, or an empty string when there is nothing left.
 */
export function embedDisplayName(target: string): string {
	const withoutSubpath = target.split("#")[0].split("?")[0].trim();
	if (withoutSubpath.length === 0) return "";
	const segments = withoutSubpath.split(PATH_SEPARATOR);
	return segments[segments.length - 1]?.trim() ?? "";
}

/**
 * Splits a wikilink embed body into its target.
 *
 * `图.png|300` keeps `图.png`; `图.pdf#page=2` loses the subpath because the
 * vault lookup cannot use it.
 *
 * @param body - Everything between `![[` and `]]`.
 * @returns The vault path to place, or an empty string when unusable.
 */
function wikiTarget(body: string): string {
	return body.split("|")[0].split("#")[0].trim();
}

/** A text card with its embeds handled. */
export interface CardContent {
	/** Text with the embeds handled according to the mode. */
	text: string;
	/**
	 * Embed targets to place as pictures, in source order.
	 *
	 * Always empty unless the mode is `"image"`; the caller still has to resolve
	 * each one against the vault, since this module has no vault access.
	 */
	targets: string[];
}

/**
 * Tidies the text left behind after embeds are removed.
 *
 * Only blank-line runs and the outer edges are touched: individual lines keep
 * their leading spaces, because a card's indentation is part of what it says.
 *
 * @param text - Raw text.
 * @returns The tidied text.
 */
function tidy(text: string): string {
	return text
		.replace(/\r\n/gu, "\n")
		.replace(/\n{3,}/gu, "\n\n")
		.trim();
}

/**
 * Handles the image embeds inside a text card.
 *
 * The three modes trade off faithfulness against looks:
 *
 * - `"keep"` leaves the Markdown untouched, so the drawing shows the raw
 *   `![[file]]` marker (what this plugin did before the setting existed);
 * - `"text"` replaces each marker with its file name, keeping the card readable
 *   as one block of text;
 * - `"image"` removes the markers from the text and reports the targets so the
 *   caller can place the pictures themselves, which is the only mode that
 *   preserves what the card actually showed.
 *
 * @param raw - The card's Markdown source.
 * @param mode - One of {@link EMBED_MODES}; anything else behaves like `"keep"`.
 * @returns The text to use and the pictures to place.
 */
export function extractCardEmbeds(raw: string, mode: string): CardContent {
	if (!isEmbedMode(mode) || mode === "keep") {
		return { text: raw, targets: [] };
	}

	const targets: string[] = [];
	const replaceWiki = (body: string): string => {
		if (mode === "image") {
			const target = wikiTarget(body);
			if (target.length > 0) targets.push(target);
			return "";
		}
		const name = embedDisplayName(wikiTarget(body));
		return name.length > 0 ? name : "";
	};
	const replaceMarkdown = (alt: string, url: string): string => {
		const bare = stripMarkdownTitle(url);
		if (mode === "image") {
			if (bare.length > 0) targets.push(bare);
			return "";
		}
		// The alt text is what a reader saw if it was written; otherwise fall
		// back to the file name behind the URL.
		const name = alt.trim() || embedDisplayName(bare);
		return name.length > 0 ? name : "";
	};

	// Removing an embed should also remove the gap it left; replacing one should
	// not touch the words around it.
	const wikiPattern = mode === "image" ? WIKI_EMBED_TRIM : WIKI_EMBED;
	const markdownPattern =
		mode === "image" ? MARKDOWN_EMBED_TRIM : MARKDOWN_EMBED;

	const text = raw
		.replace(wikiPattern, (_match, body: string) => replaceWiki(body))
		.replace(
			markdownPattern,
			(_match, alt: string, url: string) => replaceMarkdown(alt, url)
		);

	return { text: tidy(text), targets };
}
