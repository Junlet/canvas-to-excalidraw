/**
 * Drawing-name derivation and vault-safe file-name sanitising.
 *
 * Naming rules requested for this plugin:
 *   - the drawing is named after the selected object;
 *   - when several objects are selected, the topmost-leftmost one names it;
 *   - a text card contributes the first 10 characters of its text.
 *
 * Because a text card can contain characters that are illegal in a file name
 * (`/ \ : * ? " < > |`), sanitising is not cosmetic here -- without it the
 * drawing simply fails to be created. Every illegal character becomes `_`
 * so the name keeps its original length and stays predictable.
 *
 * A second, quieter class of character needs the same treatment: Obsidian
 * itself warns that "Links will not work with file names containing any of
 * these characters: # ^ [ ] |". Such a name *is* created, but it can never be
 * reached by a wikilink -- `[[# 标题.excalidraw]]` parses as a heading link
 * into the current file, and a mid-name `#` (as in `C# 教程`) splits the path.
 * A drawing nobody can link to is not worth generating, so those characters
 * are replaced as well. See {@link UNSAFE_LINK_CHARS}.
 */

/** Illegal in a vault file name on at least one supported platform. */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001F]/gu;

/**
 * Characters Obsidian calls unsafe: they break wikilinks pointing at the file.
 *
 * Taken verbatim from Obsidian's own character set (`# ^ [ ] |`). `|` is
 * already covered by {@link ILLEGAL_FILENAME_CHARS}; the rest are legal on
 * disk, which is exactly why they are worth handling -- nothing else will
 * reject them, and the damage only shows up later as a dead link.
 */
const UNSAFE_LINK_CHARS = /[#^\[\]]/gu;

/**
 * A Markdown heading marker at the very start of a card: `#` to `######`
 * followed by the space that Markdown requires.
 *
 * In a text card this is formatting, not content, so it must not be spent on
 * the name: `# 项目计划` should name the drawing `项目计划`, not `_ 项目计划`.
 * The trailing whitespace requirement is what keeps a tag (`#标签`, no space)
 * out of this rule -- a tag is content and is merely made safe afterwards.
 */
const LEADING_HEADING_MARKER = /^#{1,6}[ \t]+/u;

/** Names Windows refuses to create, with or without an extension. */
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

/** Trailing dots and spaces are stripped by Windows; strip them ourselves. */
const TRAILING_DOT_OR_SPACE = /[. ]+$/u;

/** Runs of whitespace (including newlines from multi-line cards) collapse to one space. */
const WHITESPACE_RUN = /\s+/gu;

/**
 * A name made only of underscores and spaces carries no information -- it is
 * what survives when every character of a card was illegal. Such a name is
 * valid on disk but useless to the reader, so it falls back instead.
 */
const MEANINGLESS_NAME = /^[_\s]+$/u;

/** How many characters of a text card are used when it names the drawing. */
export const TEXT_NAME_LENGTH = 10;

/** Replacement for every character that cannot appear in a file name. */
export const ILLEGAL_CHAR_REPLACEMENT = "_";

/**
 * Used when a derived name sanitises down to nothing usable.
 *
 * Deliberately NOT translated. This string becomes a real file name inside the
 * vault, and vault-facing strings follow the same rule as
 * `DEFAULT_DRAWING_FOLDER` in `folders.ts`: they do not change with the
 * interface language. Keeping it fixed also means a drawing created today and
 * one created after switching to English get the same name.
 *
 * @returns The fallback drawing name.
 */
export function fallbackName(): string {
	return "未命名 Excalidraw";
}

/** Cap on collision suffixes before falling back to a timestamp. */
const MAX_COLLISION_ATTEMPTS = 200;

/**
 * Extension the Excalidraw plugin gives a drawing.
 *
 * ExcalidrawAutomate's `create()` appends `.excalidraw.md` to the requested
 * name *only if that name does not already end in `.md`*. That single rule
 * causes two opposite failures, so {@link prepareDrawingBaseName} strips any
 * trailing drawing extension before the name is handed over:
 *
 *   - `readme.md` already ends in `.md`, so nothing is appended and a plain
 *     Markdown file comes out instead of a drawing;
 *   - `图.excalidraw` gets `.excalidraw.md` appended and comes out doubled, as
 *     `图.excalidraw.excalidraw.md`.
 */
export const DRAWING_EXTENSION = ".excalidraw.md";

/**
 * A trailing extension that would make `create()` produce the wrong file name,
 * either by suppressing its own extension (`.md`) or by duplicating it
 * (`.excalidraw`, `.excalidraw.md`).
 */
const DRAWING_SUFFIX = /\.(?:excalidraw\.md|excalidraw|md)$/iu;

/**
 * Removes trailing drawing extensions, repeatedly.
 *
 * Repeats because a name can carry more than one at once: `图.excalidraw.md`
 * loses both and becomes `图`, so `create()` appends exactly one
 * `.excalidraw.md` instead of producing `图.excalidraw.excalidraw.md`.
 *
 * @param name - Sanitised candidate name.
 * @returns The name with every trailing drawing extension removed.
 */
function stripDrawingSuffixes(name: string): string {
	let current = name;
	for (;;) {
		const next = current.replace(DRAWING_SUFFIX, "");
		if (next === current) return current;
		current = next;
	}
}

/**
 * Collapses all whitespace runs to single spaces and trims the ends.
 *
 * Multi-line cards would otherwise spend their first 10 characters on
 * newlines, producing a name that is technically valid but meaningless.
 *
 * @param raw - Any user-supplied text.
 * @returns Single-line, trimmed text.
 */
export function normalizeWhitespace(raw: string): string {
	return raw.replace(WHITESPACE_RUN, " ").trim();
}

/**
 * Drops a leading Markdown heading marker, if the text has one.
 *
 * @param text - Single-line text, already whitespace-collapsed.
 * @returns The text without its leading `#`…`######` marker.
 */
export function stripLeadingHeadingMarker(text: string): string {
	return text.replace(LEADING_HEADING_MARKER, "");
}

/**
 * Derives a drawing name from a text card's body.
 *
 * The heading marker is stripped **before** the length cut, so a card reading
 * `# 项目计划` spends all {@link TEXT_NAME_LENGTH} characters on real content
 * instead of two of them on `# `.
 *
 * @param text - The card's raw text, potentially multi-line.
 * @returns At most {@link TEXT_NAME_LENGTH} characters, single-line.
 */
export function deriveNameFromText(text: string): string {
	const withoutMarker = stripLeadingHeadingMarker(normalizeWhitespace(text));
	return withoutMarker.slice(0, TEXT_NAME_LENGTH);
}

/**
 * Derives a drawing name from a file node's vault path.
 *
 * The directory and the extension are dropped: a node pointing at
 * `图片库/photo.png` should name the drawing `photo`, not `photo.png`.
 *
 * @param vaultPath - Vault-relative path as stored on the Canvas node.
 * @returns The bare file name without its extension.
 */
export function deriveNameFromFilePath(vaultPath: string): string {
	const lastSegment = vaultPath.split("/").pop() ?? vaultPath;
	const lastDot = lastSegment.lastIndexOf(".");
	return lastDot > 0 ? lastSegment.slice(0, lastDot) : lastSegment;
}

/**
 * Turns arbitrary text into a file name that is safe on every platform.
 *
 * Order matters. Whitespace is collapsed **first**, because newline and tab are
 * themselves control characters in the illegal range -- replacing them before
 * collapsing would turn a blank card into a row of underscores instead of an
 * empty string. The heading marker is dropped next, so it counts as formatting
 * rather than as a character to replace. Trailing dots/spaces are stripped
 * last, since collapsing can expose a new trailing space.
 *
 * This runs for vault paths too, not just text cards, so a file literally named
 * `# 计划.md` also yields a linkable name.
 *
 * @param raw - Candidate name, already trimmed of any extension.
 * @returns A safe, meaningful name, or {@link fallbackName} otherwise.
 */
export function sanitizeBaseName(raw: string): string {
	const collapsed = normalizeWhitespace(raw);
	const withoutMarker = stripLeadingHeadingMarker(collapsed);
	const replaced = withoutMarker
		.replace(ILLEGAL_FILENAME_CHARS, ILLEGAL_CHAR_REPLACEMENT)
		.replace(UNSAFE_LINK_CHARS, ILLEGAL_CHAR_REPLACEMENT);
	const trimmed = replaced.replace(TRAILING_DOT_OR_SPACE, "");
	if (!isUsableBaseName(trimmed) || MEANINGLESS_NAME.test(trimmed)) {
		return fallbackName();
	}
	return trimmed;
}

/**
 * Reports whether a candidate is non-empty and not a Windows reserved name.
 *
 * @param name - Candidate name.
 * @returns True when the name may be used as-is.
 */
export function isUsableBaseName(name: string): boolean {
	if (name.length === 0) return false;
	if (name === "." || name === "..") return false;
	return !WINDOWS_RESERVED_NAME.test(name);
}

/**
 * Produces the final base name to hand to ExcalidrawAutomate's `create()`.
 *
 * Sanitises, then strips trailing drawing extensions so Excalidraw appends its
 * own exactly once (see {@link DRAWING_EXTENSION}), then re-validates because
 * stripping can empty the name.
 *
 * @param raw - Unprocessed candidate name.
 * @returns A safe base name without an extension.
 */
export function prepareDrawingBaseName(raw: string): string {
	const sanitized = sanitizeBaseName(raw);
	const withoutSuffix = stripDrawingSuffixes(sanitized);
	return isUsableBaseName(withoutSuffix) ? withoutSuffix : fallbackName();
}

/**
 * Builds the vault path a base name will occupy once Excalidraw creates it.
 *
 * Used for collision detection, so it must mirror Excalidraw's own
 * folder + `.excalidraw.md` composition exactly.
 *
 * @param folder - Destination folder, or undefined for the vault root.
 * @param baseName - Extensionless base name.
 * @returns The vault-relative path the drawing would take.
 */
export function buildDrawingPath(
	folder: string | undefined,
	baseName: string
): string {
	const fileName = `${baseName}${DRAWING_EXTENSION}`;
	return folder ? `${folder}/${fileName}` : fileName;
}

/**
 * Appends ` 1`, ` 2`, ... until the name is free.
 *
 * Mirrors the collision convention used by the Excalidraw plugin's own
 * "Deconstruct selected elements into new drawing" script so both features
 * behave the same way.
 *
 * @param baseName - Sanitised, collision-free-unknown name.
 * @param isTaken - Predicate probing the vault for an existing path.
 * @returns A name for which `isTaken` returns false, or a timestamped fallback.
 */
export function resolveUniqueBaseName(
	baseName: string,
	isTaken: (candidate: string) => boolean
): string {
	if (!isTaken(baseName)) return baseName;
	for (let suffix = 1; suffix <= MAX_COLLISION_ATTEMPTS; suffix += 1) {
		const candidate = `${baseName} ${suffix}`;
		if (!isTaken(candidate)) return candidate;
	}
	return `${baseName} ${Date.now()}`;
}
