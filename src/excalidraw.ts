/**
 * Bridge into the Excalidraw plugin.
 *
 * Access path (documented by the Excalidraw plugin as the supported route for
 * *other plugins*):
 *
 *   app.plugins.plugins["obsidian-excalidraw-plugin"].ea.getAPI()
 *
 * `getAPI()` returns a brand-new, dedicated `ExcalidrawAutomate` instance, so we
 * never disturb an open drawing, the script engine, or the shared
 * `window.ExcalidrawAutomate`. Crucially this means a drawing can be assembled
 * with **no Excalidraw view open at all** -- which is the normal situation when
 * the user triggers us from a Canvas.
 */

import type { App, TFile } from "obsidian";
import type {
	CanvasNodeData,
	ConnectionPointLike,
	ExcalidrawAutomateLike,
	ExcalidrawPluginLike,
} from "./types";
import type { CanvasBounds } from "./canvas";
import type { InternalEdge } from "./edges";
import { resolveTextColors, type TextColorMode } from "./colors";
import {
	allowsUpscale,
	classifyVaultFile,
	isDrawingFile,
	wantsSizeAnchor,
	type DrawingFileProbe,
	type NonImageMode,
} from "./attachments";

/** Folder/id of the Excalidraw plugin in Obsidian's plugin registry. */
export const EXCALIDRAW_PLUGIN_ID = "obsidian-excalidraw-plugin";

/** Narrow text elements stay readable instead of wrapping one glyph per line. */
const MIN_TEXT_WIDTH = 120;

/** How long to wait for the drawing file to appear on disk. */
const FILE_WAIT_TIMEOUT_MS = 5000;

/** Interval between existence checks while waiting for the drawing file. */
const FILE_WAIT_INTERVAL_MS = 50;

/** Raised when the selection contains nothing this plugin can move. */
export class NothingToMoveError extends Error {}

/** Raised when the Excalidraw plugin is absent, disabled, or too old. */
export class ExcalidrawUnavailableError extends Error {}

/** Outcome of assembling a drawing from Canvas nodes. */
export interface DrawingResult {
	/** Vault path of the created drawing. */
	path: string;
	/** How many image nodes were placed. */
	imageCount: number;
	/** How many Excalidraw drawings were placed as rendered images. */
	drawingCount: number;
	/** How many Markdown notes (and PDFs) were placed as rendered images. */
	noteCount: number;
	/** How many text cards were placed. */
	textCount: number;
	/** How many arrows were recreated inside the drawing. */
	arrowCount: number;
	/** Human-readable reasons for nodes that could not be moved. */
	skipped: string[];
}

/** A live ExcalidrawAutomate instance plus the plugin that issued it. */
export interface ExcalidrawBridge {
	ea: ExcalidrawAutomateLike;
	plugin: ExcalidrawPluginLike;
}

/**
 * Reaches the Excalidraw plugin instance, or null when it is unavailable.
 *
 * @param app - The Obsidian app.
 * @returns The plugin, or null.
 */
export function getExcalidrawPlugin(app: App): ExcalidrawPluginLike | null {
	const registry = app as unknown as {
		plugins?: { plugins?: Record<string, unknown> };
	};
	return (registry.plugins?.plugins?.[EXCALIDRAW_PLUGIN_ID] as
		| ExcalidrawPluginLike
		| undefined) ?? null;
}

/**
 * Reaches the Excalidraw plugin and mints a dedicated ExcalidrawAutomate.
 *
 * @param app - The Obsidian app.
 * @returns The bridge, or null when Excalidraw is missing/disabled/incompatible.
 */
export function acquireExcalidraw(app: App): ExcalidrawBridge | null {
	const plugin = getExcalidrawPlugin(app);
	if (!plugin) return null;

	const factory = plugin.ea;
	if (!factory || typeof factory.getAPI !== "function") return null;

	try {
		const ea = factory.getAPI();
		if (!ea || typeof ea.create !== "function") return null;
		return { ea, plugin };
	} catch (error) {
		console.error(
			"[canvas-to-excalidraw] ExcalidrawAutomate.getAPI() failed",
			error
		);
		return null;
	}
}

/**
 * Reads the folder the Excalidraw plugin is configured to write drawings into.
 *
 * @param plugin - The Excalidraw plugin instance.
 * @returns The configured vault folder, or undefined to let Excalidraw decide.
 */
export function getDrawingFolder(
	plugin: ExcalidrawPluginLike
): string | undefined {
	const folder = plugin.settings?.folder;
	if (typeof folder !== "string") return undefined;
	const trimmed = folder.replace(/^\/+|\/+$/gu, "").trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Creates the destination folder when it does not exist yet.
 *
 * Excalidraw's own `createDrawing()` already does this, but relying on an
 * internal step of another plugin for something this visible is fragile: if it
 * ever stops, `vault.create()` throws and the user sees a bare failure. Doing
 * it here is cheap and makes the failure mode impossible.
 *
 * @param app - The Obsidian app.
 * @param folder - Vault-relative folder path; empty means the vault root.
 */
async function ensureFolder(app: App, folder: string): Promise<void> {
	if (!folder) return;
	try {
		if (app.vault.getFolderByPath(folder)) return;
		await app.vault.createFolder(folder);
	} catch (error) {
		// createFolder throws when the folder appeared in the meantime, which
		// is not a failure worth reporting.
		console.warn(
			"[canvas-to-excalidraw] 创建文件夹时出错（可能已存在）：",
			folder,
			error
		);
	}
}

/**
 * Resolves a Canvas `file` node's path to a vault file.
 *
 * @param app - The Obsidian app.
 * @param vaultPath - Path as stored on the node.
 * @param sourcePath - Path of the Canvas file, for link resolution.
 * @returns The file, or null when it cannot be resolved.
 */
export function resolveVaultFile(
	app: App,
	vaultPath: string,
	sourcePath: string
): TFile | null {
	const direct = app.vault.getFileByPath(vaultPath);
	if (direct) return direct;
	return app.metadataCache.getFirstLinkpathDest(vaultPath, sourcePath);
}

/**
 * Rescales a staged picture element to fit the Canvas node's box.
 *
 * `addImage(..., scale = false)` stages the picture at its natural pixel size,
 * so the element's current `width`/`height` *are* the natural dimensions.
 * Fitting them into the node's box preserves the aspect ratio rather than
 * stretching to match a box the user may have resized freely.
 *
 * @param ea - The ExcalidrawAutomate instance.
 * @param elementId - Id returned by `addImage`.
 * @param boxWidth - Target width, from the Canvas node.
 * @param boxHeight - Target height, from the Canvas node.
 * @param allowUpscale - Whether enlarging is lossless for this embed kind.
 */
function fitElementToBox(
	ea: ExcalidrawAutomateLike,
	elementId: string,
	boxWidth: number,
	boxHeight: number,
	allowUpscale: boolean
): void {
	const element = ea.getElement(elementId);
	if (!element) return;
	const naturalWidth = Number(element.width);
	const naturalHeight = Number(element.height);
	if (!(naturalWidth > 0) || !(naturalHeight > 0)) return;
	if (!(boxWidth > 0) || !(boxHeight > 0)) return;

	let ratio = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
	// A rasterised note or PDF page is a one-off snapshot; never blur it by
	// stretching it beyond the size it was rendered at.
	if (!allowUpscale) ratio = Math.min(ratio, 1);
	if (!Number.isFinite(ratio) || ratio <= 0) return;
	element.width = naturalWidth * ratio;
	element.height = naturalHeight * ratio;
}

/**
 * Polls until a vault file appears.
 *
 * `ea.create()` drives the Excalidraw plugin's own (partly asynchronous) file
 * creation, so the file is not always readable the instant the promise settles.
 *
 * @param app - The Obsidian app.
 * @param path - Vault path to watch.
 * @returns The file once present, or null on timeout.
 */
async function waitForVaultFile(app: App, path: string): Promise<TFile | null> {
	const attempts = Math.ceil(FILE_WAIT_TIMEOUT_MS / FILE_WAIT_INTERVAL_MS);
	for (let attempt = 0; attempt <= attempts; attempt += 1) {
		const file = app.vault.getFileByPath(path);
		if (file) return file;
		await new Promise((resolve) =>
			window.setTimeout(resolve, FILE_WAIT_INTERVAL_MS)
		);
	}
	return null;
}

/**
 * Narrows a Canvas side string to an Excalidraw connection point.
 *
 * Canvas and Excalidraw agree on the four side names, so anything else (an
 * absent side, or a value from a future Canvas version) degrades to `null`,
 * which lets Excalidraw route the arrow between element centres.
 *
 * @param side - Canvas `fromSide` / `toSide`.
 * @returns A connection point Excalidraw understands.
 */
function toConnectionPoint(side: string | undefined): ConnectionPointLike {
	switch (side) {
		case "top":
		case "bottom":
		case "left":
		case "right":
			return side;
		default:
			return null;
	}
}

/**
 * Stages the selected Canvas nodes on the EA workbench, then writes a drawing.
 *
 * The workbench is the only thing mutated here: no scene and no vault file is
 * touched until `create()` succeeds. Combined with the caller's ordering (canvas
 * is edited only after this resolves), a failure at any point leaves both the
 * Canvas and the vault exactly as they were.
 *
 * @param app - The Obsidian app.
 * @param bridge - Live Excalidraw bridge.
 * @param options - Selection, geometry, naming, destination, and styling.
 * @returns The created drawing's path plus per-node accounting.
 * @throws {NothingToMoveError} When no node in the selection is movable.
 * @throws {ExcalidrawUnavailableError} When the drawing file never materialises.
 */
export async function createDrawingFromSelection(
	app: App,
	bridge: ExcalidrawBridge,
	options: {
		baseName: string;
		folder: string | undefined;
		nodes: CanvasNodeData[];
		bounds: CanvasBounds;
		sourcePath: string;
		/** Excalidraw `fontFamily` id applied to every text card. */
		fontFamily: number;
		/** How a Canvas card colour is carried into the drawing. */
		textColorMode: TextColorMode;
		/** Whether non-image files (Markdown notes, PDFs) are embedded. */
		nonImageMode: NonImageMode;
		/**
		 * Metadata-aware drawing check, so a drawing whose filename no longer
		 * says `.excalidraw` is not mistaken for a plain note.
		 */
		drawingProbe?: DrawingFileProbe;
		/**
		 * Edges wholly inside the selection, to be recreated as Excalidraw
		 * arrows binding the corresponding elements.
		 */
		internalEdges: InternalEdge[];
	}
): Promise<DrawingResult> {
	const { ea } = bridge;
	const skipped: string[] = [];
	let imageCount = 0;
	let drawingCount = 0;
	let noteCount = 0;
	let textCount = 0;
	let arrowCount = 0;

	/** Canvas node id -> Excalidraw element id, for wiring arrows. */
	const elementIds = new Map<string, string>();

	ea.clear();
	try {
		// `ea.clear()` discards staged elements but deliberately leaves style
		// values alone, so styles must be set on every run rather than relying
		// on whatever the shared style object last held. Excalidraw's own
		// defaults are captured here so each card can be reset to them --
		// otherwise a coloured card would leak its colour into later cards.
		const defaultStrokeColor = ea.style.strokeColor;
		const defaultBackgroundColor = ea.style.backgroundColor;
		ea.style.fontFamily = options.fontFamily;

		for (const node of options.nodes) {
			const x = Math.round(node.x - options.bounds.minX);
			const y = Math.round(node.y - options.bounds.minY);

			if (node.type === "text") {
				const text = typeof node.text === "string" ? node.text : "";
				if (text.trim().length === 0) {
					skipped.push("空白文本卡片");
					continue;
				}
				const colors = resolveTextColors(
					options.textColorMode,
					node.color
				);
				ea.style.strokeColor =
					colors.strokeColor ?? defaultStrokeColor;
				ea.style.backgroundColor =
					colors.backgroundColor ?? defaultBackgroundColor;

				const textId = ea.addText(x, y, text, {
					width: Math.max(Math.round(node.width), MIN_TEXT_WIDTH),
				});
				if (textId) elementIds.set(node.id, textId);
				textCount += 1;
				continue;
			}

			if (node.type === "file") {
				const vaultPath = typeof node.file === "string" ? node.file : "";
				const file = vaultPath
					? resolveVaultFile(app, vaultPath, options.sourcePath)
					: null;
				if (!file) {
					skipped.push(`找不到文件：${vaultPath || "(空)"}`);
					continue;
				}

				// Pictures go in directly; drawings, Markdown notes and PDFs are
				// rasterised by the Excalidraw plugin's own loader (the same
				// path behind its "嵌入文件 -> 以图像形式" dialog).
				const kind = classifyVaultFile(
					file,
					options.nonImageMode,
					options.drawingProbe
				);
				if (!kind) {
					// Explain *why* it was dropped: gated by the setting, or
					// genuinely unsupported. Calling a drawing a "note" here was
					// the old behaviour and was simply wrong.
					const extension = (file.extension || "").toLowerCase();
					const gated =
						isDrawingFile(file, options.drawingProbe) ||
						extension === "md" ||
						extension === "pdf";
					skipped.push(
						gated
							? `${
									isDrawingFile(file, options.drawingProbe)
										? "图纸"
										: extension === "pdf"
											? "PDF"
											: "笔记"
								}未嵌入（已在设置里关闭）：${file.name}`
							: `不支持的文件类型，已跳过：${file.name}`
					);
					continue;
				}

				let elementId: string | undefined;
				try {
					elementId = await ea.addImage(
						x,
						y,
						file,
						false,
						wantsSizeAnchor(kind)
					);
				} catch (error) {
					console.error(
						"[canvas-to-excalidraw] addImage() failed",
						file.path,
						error
					);
				}
				if (!elementId) {
					skipped.push(`渲染失败，已跳过：${file.name}`);
					continue;
				}
				fitElementToBox(
					ea,
					elementId,
					node.width,
					node.height,
					allowsUpscale(kind)
				);
				elementIds.set(node.id, elementId);
				if (kind === "image") {
					imageCount += 1;
				} else if (kind === "drawing") {
					drawingCount += 1;
				} else {
					noteCount += 1;
				}
				continue;
			}

			skipped.push(
				node.type === "link" ? "链接卡片" : `不支持的节点类型：${node.type}`
			);
		}

		if (imageCount + drawingCount + noteCount + textCount === 0) {
			throw new NothingToMoveError(
				"选中的内容里没有可移动的图片、图纸、笔记或文本卡片。"
			);
		}

		// Arrows are staged last so both endpoints already exist on the
		// workbench -- `connectObjects` silently does nothing otherwise.
		for (const edge of options.internalEdges) {
			const fromId = elementIds.get(edge.from);
			const toId = elementIds.get(edge.to);
			if (!fromId || !toId) {
				// An endpoint was skipped (missing image, empty card, ...).
				skipped.push("一条箭头因端点未移入而省略");
				continue;
			}
			try {
				const arrowId = ea.connectObjects(
					fromId,
					toConnectionPoint(edge.fromSide),
					toId,
					toConnectionPoint(edge.toSide),
					{ endArrowHead: "arrow" }
				);
				if (arrowId) arrowCount += 1;
			} catch (error) {
				console.error(
					"[canvas-to-excalidraw] connectObjects() failed",
					error
				);
				skipped.push("一条箭头创建失败");
			}
		}

		await ensureFolder(app, options.folder ?? "");

		const createdPath = await ea.create({
			filename: options.baseName,
			foldername: options.folder,
			// `silent` writes the file without opening it or prompting.
			silent: true,
		});

		const file = await waitForVaultFile(app, createdPath);
		if (!file) {
			throw new ExcalidrawUnavailableError(
				`Excalidraw 未能在预期时间内创建文件：${createdPath}`
			);
		}

		return {
			path: file.path,
			imageCount,
			drawingCount,
			noteCount,
			textCount,
			arrowCount,
			skipped,
		};
	} finally {
		// Always discard the workbench, including on the error paths above.
		ea.clear();
	}
}
