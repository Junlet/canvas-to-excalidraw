/**
 * What a Canvas file node may contribute to a drawing.
 *
 * Canvas file nodes usually point at images, but they can point at any vault
 * file. ExcalidrawAutomate's `addImage()` knows how to turn Markdown notes,
 * PDFs **and Excalidraw drawings** into picture elements:
 * `EmbeddedFileLoader._getObsidianImage()` accepts `file.extension === "md"`
 * alongside the image types and renders drawings through its `isExcalidrawFile`
 * branch, while `addImage()` mints a fresh `fileId` for `.md`/`.pdf` so the
 * *rendered* result is embedded rather than linked back to the source.
 *
 * Crucially that path works entirely on the EA workbench, so it needs no open
 * Excalidraw view -- the same property that makes the rest of this plugin work
 * from a Canvas.
 *
 * RECOGNISING DRAWINGS
 * --------------------
 * An Excalidraw drawing **is** a Markdown file, so the extension alone is not
 * enough: a user may rename `图.excalidraw.md` to `图.md`, and legacy files are
 * named `图.excalidraw`. Classification therefore takes an optional probe that
 * consults the file's metadata, mirroring the two signals Excalidraw itself
 * uses (`excalidraw-plugin` frontmatter and the `excalidraw` tag).
 *
 * The classification is kept pure -- the probe is injected -- so the policy is
 * testable and the "which files are allowed" decision lives in one place.
 */

import type { TFile } from "obsidian";
import { t } from "./i18n";

/** How Canvas file nodes that are not plain images are treated. */
export type NonImageMode = "skip" | "markdown" | "markdown-and-pdf";

/** What kind of element a vault file will become. */
export type EmbedKind = "image" | "drawing" | "markdown" | "pdf";

/** Extensions handed straight to `addImage` as pictures. */
const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"avif",
]);

/** Extensions Excalidraw can rasterise on the fly. */
const MARKDOWN_EXTENSIONS = new Set(["md"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

/** Frontmatter key Excalidraw writes into every drawing it creates. */
const EXCALIDRAW_FRONTMATTER_KEY = "excalidraw-plugin";

/** Tag Excalidraw adds to every drawing it creates. */
const EXCALIDRAW_TAG = "excalidraw";

/**
 * Metadata-aware check for a drawing whose name no longer says so.
 *
 * Injected by the plugin, which can reach Obsidian's metadata cache and the
 * Excalidraw plugin. Keeping it a parameter is what lets
 * {@link classifyVaultFile} stay pure.
 *
 * @param file - The file to test.
 * @returns True when the file is an Excalidraw drawing.
 */
export type DrawingFileProbe = (file: TFile) => boolean;

/**
 * Reports whether a value is a recognised non-image mode.
 *
 * @param value - Candidate value.
 * @returns True for one of the three supported modes.
 */
export function isNonImageMode(value: unknown): value is NonImageMode {
	return (
		value === "skip" || value === "markdown" || value === "markdown-and-pdf"
	);
}

/**
 * Normalises a tag to its bare form.
 *
 * Frontmatter tags arrive bare (`excalidraw`) while inline ones arrive with a
 * leading hash (`#excalidraw`), so both are reduced to the same string.
 *
 * @param value - Candidate tag.
 * @returns The bare tag, or null when it is not a usable string.
 */
function normalizeTag(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const bare = value.trim().replace(/^#/u, "").toLowerCase();
	return bare.length > 0 ? bare : null;
}

/**
 * Collects tag strings out of a frontmatter value.
 *
 * Obsidian accepts `tags: [a, b]`, `tags: a, b` and `tag: a`, so all three
 * shapes are handled.
 *
 * @param value - The `tags` or `tag` frontmatter value.
 * @returns Bare tag names.
 */
function collectFrontmatterTags(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map(normalizeTag)
			.filter((tag): tag is string => tag !== null);
	}
	if (typeof value === "string") {
		return value
			.split(",")
			.map(normalizeTag)
			.filter((tag): tag is string => tag !== null);
	}
	return [];
}

/**
 * Reports whether note metadata marks a file as an Excalidraw drawing.
 *
 * This is the safety net for a drawing whose filename no longer says so: the
 * user may rename `图.excalidraw.md` to `图.md`, but the frontmatter and tag
 * Excalidraw wrote at creation time stay behind.
 *
 * @param frontmatter - `CachedMetadata.frontmatter`.
 * @param inlineTags - `CachedMetadata.tags`, for inline `#excalidraw`.
 * @returns True when the metadata identifies a drawing.
 */
export function marksDrawing(
	frontmatter: unknown,
	inlineTags?: unknown
): boolean {
	if (frontmatter && typeof frontmatter === "object") {
		const record = frontmatter as Record<string, unknown>;
		if (EXCALIDRAW_FRONTMATTER_KEY in record) return true;
		const tags = [
			...collectFrontmatterTags(record.tags),
			...collectFrontmatterTags(record.tag),
		];
		if (tags.includes(EXCALIDRAW_TAG)) return true;
	}

	if (Array.isArray(inlineTags)) {
		for (const entry of inlineTags) {
			const tag =
				entry && typeof entry === "object"
					? normalizeTag((entry as { tag?: unknown }).tag)
					: normalizeTag(entry);
			if (tag === EXCALIDRAW_TAG) return true;
		}
	}

	return false;
}

/**
 * Reports whether a file is an Excalidraw drawing.
 *
 * Name first (cheap), then the injected probe (authoritative), so both a
 * renamed drawing and a legacy `.excalidraw` file are recognised.
 *
 * @param file - The file to test.
 * @param probe - Optional metadata-aware check.
 * @returns True when the file is a drawing.
 */
export function isDrawingFile(
	file: TFile,
	probe?: DrawingFileProbe
): boolean {
	const path = (file.path || file.name || "").toLowerCase();
	if (path.endsWith(".excalidraw.md") || path.endsWith(".excalidraw")) {
		return true;
	}
	return probe?.(file) ?? false;
}

/**
 * Decides whether a vault file can be embedded, and as what.
 *
 * Drawings are checked before the Markdown branch because a drawing **is** a
 * `.md` file; without that ordering a renamed drawing would be treated as a
 * plain note. They also cover the legacy `.excalidraw` extension, which the
 * Markdown/PDF branches would otherwise reject outright.
 *
 * Drawings are gated by the same non-image policy as notes and PDFs: a user who
 * chose "跳过（只移入图片）" has said they do not want file-based embeds pulled
 * in, and a drawing is a file-based embed.
 *
 * @param file - The file a Canvas node points at.
 * @param mode - The user's policy for non-image files.
 * @param probe - Optional metadata-aware drawing check.
 * @returns The embed kind, or null when the file should be skipped.
 */
export function classifyVaultFile(
	file: TFile,
	mode: NonImageMode,
	probe?: DrawingFileProbe
): EmbedKind | null {
	const extension = (file.extension || "").toLowerCase();

	if (IMAGE_EXTENSIONS.has(extension)) return "image";

	if (isDrawingFile(file, probe)) {
		return mode === "skip" ? null : "drawing";
	}

	if (mode === "skip") return null;
	if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
	if (mode === "markdown-and-pdf" && PDF_EXTENSIONS.has(extension)) {
		return "pdf";
	}
	return null;
}

/**
 * Whether the element's size may be scaled **up** to fill the Canvas node's box.
 *
 * Photographs and diagrams can be enlarged freely: Excalidraw keeps the original
 * bytes and re-renders them, so there is no quality loss. A note, PDF page or
 * drawing, by contrast, is rasterised once at a size the Excalidraw plugin
 * chose; stretching that snapshot up would only blur it.
 *
 * @param kind - The embed kind.
 * @returns True when enlarging is lossless.
 */
export function allowsUpscale(kind: EmbedKind): boolean {
	return kind === "image";
}

// A matching `wantsSizeAnchor()` used to live here, returning true for plain
// images so they were recorded with Excalidraw's `|100%` anchor. It was removed
// because that anchor sets `customData.isAnchored`, which disables resizing
// outright and resets the element to the image's natural pixel size on every
// load. Drawings created before the change keep the flag in their scene data,
// so their images stay frozen until re-inserted.

/**
 * Names an embed kind for user-facing text.
 *
 * Resolved per call rather than from a module-level table: a constant holding
 * `t()` results would be frozen at import time, before the language setting is
 * applied.
 *
 * @param kind - The embed kind.
 * @returns A short label in the current language.
 */
export function embedKindLabel(kind: EmbedKind): string {
	switch (kind) {
		case "image":
			return t("kind.image");
		case "drawing":
			return t("kind.drawing");
		case "markdown":
			return t("kind.markdown");
		default:
			// "PDF" is an acronym that reads the same in both languages, so it
			// is deliberately not a translated string.
			return "PDF";
	}
}
