/**
 * Canvas to Excalidraw
 * ====================
 *
 * Moves the objects selected in an Obsidian Canvas into a newly created
 * Excalidraw drawing, then replaces them on the Canvas with a single node
 * pointing at that drawing.
 *
 * Requested behaviour, and where it is implemented:
 *   1.1 multiple objects at once ......... `getSelectionNodes()` returns all
 *   1.2 images and text cards mixed ..... per-node dispatch in `run()`
 *   1.3 flexible trigger ................. Canvas context menu + command palette
 *   1.4 drawing created on demand ........ `ea.create()` in `excalidraw.ts`
 *   1.5 named after the selection ........ `naming.ts` (+ topmost-leftmost rule)
 *   1.6 delete originals, insert the file  `replaceNodesWithFileNode()`
 *   1.7 text cards carried across ........ `ea.addText()`
 *   1.8 text optional .................... unsupported nodes are skipped and
 *                                          reported rather than aborting
 *
 * Design constraints that shaped this file:
 *   - Canvas has no public API, so *all* Canvas contact is confined to
 *     `canvas.ts`, which probes every member before calling it.
 *   - Excalidraw is assembled through `ExcalidrawAutomate`, which needs no open
 *     Excalidraw view -- the normal case when triggering from a Canvas.
 *   - The Canvas is mutated **only after** the drawing exists on disk, so a
 *     failure anywhere leaves both the Canvas and the vault untouched.
 */

import { Notice, Plugin, View, type EventRef, type TFile } from "obsidian";
import {
	commitCanvasData,
	computeBounds,
	createCanvasNodeId,
	CanvasUnavailableError,
	getSelectionNodes,
	hasEditingNode,
	pickNamingNode,
	readCanvasData,
	readNodeData,
} from "./canvas";
import type { CanvasBounds } from "./canvas";
import {
	buildDrawingPath,
	deriveNameFromFilePath,
	deriveNameFromText,
	fallbackName,
	prepareDrawingBaseName,
	resolveUniqueBaseName,
} from "./naming";
import { setLanguage, t } from "./i18n";
import {
	NothingToMoveError,
	acquireExcalidraw,
	createDrawingFromSelection,
	getDrawingFolder,
	getExcalidrawPlugin,
	type DrawingResult,
} from "./excalidraw";
import { marksDrawing, type DrawingFileProbe } from "./attachments";
import { normalizeVaultFolder, resolveDrawingFolder } from "./folders";
import type { CanvasLike, CanvasMenuLike, CanvasNodeData } from "./types";
import type { CanvasData } from "./types";
import {
	reconcileEdges,
	selectInternalEdges,
	type EdgeReconciliation,
} from "./edges";
import {
	CanvasToExcalidrawSettingTab,
	DEFAULT_SETTINGS,
	normalizeSettings,
	type CanvasToExcalidrawSettings,
} from "./settings";

/** Stable command id -- must never change once released. */
const COMMAND_ID = "move-selection-into-new-excalidraw";

/**
 * Label shared by the command and the context-menu entry.
 *
 * A function rather than a constant: a module-level `t()` call would be
 * evaluated at import time, before the language setting has been applied.
 *
 * @returns The command label in the current language.
 */
function commandName(): string {
	return t("command.moveSelection");
}

/** Lucide icon used for the context-menu entry. */
const MENU_ICON = "pen-tool";

/**
 * Minimum footprint of the node inserted in place of the moved content.
 * Keeps a drawing readable when the original selection was tiny.
 */
const MIN_REPLACEMENT_DIMENSION = 300;

export default class CanvasToExcalidrawPlugin extends Plugin {
	settings: CanvasToExcalidrawSettings = DEFAULT_SETTINGS;

	/**
	 * Metadata-aware drawing test.
	 *
	 * An Excalidraw drawing is a Markdown file, so a renamed one looks exactly
	 * like a note. Without this, such a file would be handed to the note branch
	 * and its scene source could be embedded as if it were prose.
	 */
	private readonly drawingProbe: DrawingFileProbe = (file: TFile) =>
		this.probeDrawing(file);

	async onload(): Promise<void> {
		await this.loadSettings();
		setLanguage(this.settings.language);
		this.addSettingTab(new CanvasToExcalidrawSettingTab(this.app, this));

		this.addCommand({
			id: COMMAND_ID,
			name: commandName(),
			// Shown whenever a Canvas is active; `run()` explains the rest, which
			// keeps the command discoverable instead of silently vanishing.
			checkCallback: (checking: boolean) => {
				const context = this.resolveActiveCanvas();
				if (!context) return false;
				if (!checking) {
					void this.run(
						context.canvas,
						context.file,
						getSelectionNodes(context.canvas)
					);
				}
				return true;
			},
		});

		this.registerCanvasMenus();
	}

	/**
	 * Subscribes to Canvas's context-menu events.
	 *
	 * `canvas:node-menu` and `canvas:selection-menu` are undocumented workspace
	 * events; both are confirmed present in current Obsidian builds and are used
	 * by several widely installed Canvas plugins.
	 */
	private registerCanvasMenus(): void {
		const workspace = this.app.workspace as unknown as {
			on(
				name: string,
				callback: (menu: unknown, subject: unknown) => unknown
			): EventRef;
		};

		this.registerEvent(
			workspace.on("canvas:selection-menu", (menu, canvas) => {
				this.addMenuEntry(menu as CanvasMenuLike, canvas as CanvasLike, null);
			})
		);

		this.registerEvent(
			workspace.on("canvas:node-menu", (menu, node) => {
				const canvas = (node as { canvas?: CanvasLike } | null)?.canvas;
				if (!canvas) return;
				this.addMenuEntry(menu as CanvasMenuLike, canvas, readNodeData(node));
			})
		);
	}

	/**
	 * Adds the "move into a new Excalidraw file" entry to a Canvas context menu.
	 *
	 * @param menu - Menu supplied by Obsidian.
	 * @param canvas - Canvas the menu belongs to.
	 * @param contextNode - Node that was right-clicked, when applicable.
	 */
	private addMenuEntry(
		menu: CanvasMenuLike,
		canvas: CanvasLike,
		contextNode: CanvasNodeData | null
	): void {
		if (!menu || typeof menu.addItem !== "function") return;
		if (!canvas || canvas.readonly) return;

		const nodes = this.resolveMenuNodes(canvas, contextNode);
		if (nodes.length === 0) return;

		menu.addItem((item) =>
			item
				.setTitle(commandName())
				.setIcon(MENU_ICON)
				.onClick(() => {
					void this.run(canvas, this.findFileForCanvas(canvas), nodes);
				})
		);
	}

	/**
	 * Decides which nodes a context-menu invocation applies to.
	 *
	 * Right-clicking a node that is part of the current selection should act on
	 * the whole selection; right-clicking a node outside it should act on just
	 * that node, regardless of what the selection container still reports.
	 *
	 * @param canvas - Canvas the menu belongs to.
	 * @param contextNode - Node that was right-clicked, when applicable.
	 * @returns The nodes to move.
	 */
	private resolveMenuNodes(
		canvas: CanvasLike,
		contextNode: CanvasNodeData | null
	): CanvasNodeData[] {
		const selected = getSelectionNodes(canvas);
		if (!contextNode) return selected;
		if (selected.some((node) => node.id === contextNode.id)) return selected;
		return [contextNode];
	}

	/**
	 * Finds the Canvas currently open in the active leaf.
	 *
	 * @returns The Canvas and its file, or null when the active view is not one.
	 */
	private resolveActiveCanvas(): {
		canvas: CanvasLike;
		file: TFile | null;
	} | null {
		const view = this.app.workspace.getActiveViewOfType(View);
		if (!view || view.getViewType() !== "canvas") return null;
		const internal = view as unknown as {
			canvas?: CanvasLike;
			file?: TFile;
		};
		if (!internal.canvas) return null;
		return { canvas: internal.canvas, file: internal.file ?? null };
	}

	/**
	 * Locates the vault file backing a Canvas instance.
	 *
	 * Context-menu events hand us the Canvas but not its file, and the file is
	 * needed so relative image references resolve from the right folder.
	 *
	 * @param canvas - The Canvas instance to identify.
	 * @returns The Canvas file, or null when no leaf owns it.
	 */
	private findFileForCanvas(canvas: CanvasLike): TFile | null {
		let found: TFile | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const internal = leaf.view as unknown as {
				canvas?: CanvasLike;
				file?: TFile;
			};
			if (internal.canvas === canvas && internal.file) {
				found = internal.file;
			}
		});
		return found;
	}

	/**
	 * Runs the move: create the drawing first, then rewrite the Canvas.
	 *
	 * @param canvas - Canvas to operate on.
	 * @param canvasFile - The Canvas's file, for link resolution.
	 * @param nodes - Nodes to move.
	 */
	private async run(
		canvas: CanvasLike,
		canvasFile: TFile | null,
		nodes: CanvasNodeData[]
	): Promise<void> {
		try {
			if (canvas.readonly) {
				new Notice(t("notice.readonly"));
				return;
			}

			if (nodes.length === 0) {
				new Notice(t("notice.nothingSelected"));
				return;
			}

			// Writing canvas data while a node has focus discards the user's
			// in-progress edit, so refuse before doing anything else.
			if (hasEditingNode(canvas)) {
				new Notice(t("notice.editing"));
				return;
			}

			// One snapshot serves both jobs: finding the arrows that live inside
			// the selection, and writing the result back afterwards. Reading it
			// once also guarantees the two operations see the same document.
			const canvasData = readCanvasData(canvas);

			const bridge = acquireExcalidraw(this.app);
			if (!bridge) {
				new Notice(t("notice.excalidrawMissing"));
				return;
			}

			const bounds = computeBounds(nodes);
			const namingNode = pickNamingNode(nodes, this.settings.namingAnchor);
			const baseName = prepareDrawingBaseName(
				namingNode ? deriveRawName(namingNode) : fallbackName()
			);
			const selectedIds = new Set(nodes.map((node) => node.id));
			const internalEdges = this.settings.moveEdgesIntoDrawing
				? selectInternalEdges(canvasData.edges, selectedIds)
				: [];
			// An empty setting means "inherit the Excalidraw plugin's own folder
			// setting", not "the vault root": ExcalidrawAutomate treats a falsy
			// `foldername` as "use my configured folder", so passing "" could
			// never mean the root anyway.
			const configured = normalizeVaultFolder(
				this.settings.drawingFolder
			);
			const baseFolder =
				configured.length > 0
					? configured
					: (getDrawingFolder(bridge.plugin) ?? "");
			const folder = resolveDrawingFolder(
				baseFolder,
				this.settings.monthSubfolders
			);
			const uniqueName = resolveUniqueBaseName(
				baseName,
				(candidate) =>
					this.app.vault.getAbstractFileByPath(
						buildDrawingPath(folder, candidate)
					) !== null
			);

			const result = await createDrawingFromSelection(this.app, bridge, {
				baseName: uniqueName,
				folder,
				nodes,
				bounds,
				sourcePath: canvasFile?.path ?? "",
				fontFamily: this.settings.textFontFamily,
				textColorMode: this.settings.textColorMode,
				nonImageMode: this.settings.nonImageMode,
				drawingProbe: this.drawingProbe,
				internalEdges,
			});

			// Only now is the Canvas touched: the drawing is safely on disk.
			const reconciliation = await this.replaceNodesWithFileNode(
				canvas,
				nodes,
				bounds,
				result.path,
				canvasData
			);

			new Notice(buildSuccessMessage(result, uniqueName, reconciliation));
		} catch (error) {
			console.error("[canvas-to-excalidraw] " + t("log.moveFailed"), error);
			new Notice(
				t("notice.moveFailed", { reason: describeError(error) })
			);
		}
	}

	/**
	 * Deletes the moved nodes and inserts a file node in their place.
	 *
	 * Source image files are never touched -- only references to them disappear
	 * from the Canvas document. Edges that touched a removed node are dropped so
	 * the saved `.canvas` cannot contain dangling links.
	 *
	 * @param canvas - Canvas to rewrite.
	 * @param nodes - Nodes being replaced.
	 * @param bounds - Bounding box of those nodes, used for placement.
	 * @param drawingPath - Vault path of the created drawing.
	 * @param data - Canvas snapshot taken before the drawing was created.
	 * @returns How the Canvas's edges were reconciled.
	 */
	private async replaceNodesWithFileNode(
		canvas: CanvasLike,
		nodes: CanvasNodeData[],
		bounds: CanvasBounds,
		drawingPath: string,
		data: CanvasData
	): Promise<EdgeReconciliation> {
		const removedIds = new Set(nodes.map((node) => node.id));

		const remainingNodes = data.nodes.filter(
			(node) => !removedIds.has(node.id)
		);

		// The replacement node's id must exist before edges can point at it.
		const takenIds = new Set(remainingNodes.map((node) => node.id));
		const newNodeId = createCanvasNodeId(takenIds);

		const reconciliation = reconcileEdges(
			data.edges,
			removedIds,
			newNodeId,
			this.settings.edgePolicy
		);

		remainingNodes.push({
			id: newNodeId,
			type: "file",
			file: drawingPath,
			x: Math.round(bounds.minX),
			y: Math.round(bounds.minY),
			width: Math.max(MIN_REPLACEMENT_DIMENSION, Math.round(bounds.width)),
			height: Math.max(MIN_REPLACEMENT_DIMENSION, Math.round(bounds.height)),
		});

		await commitCanvasData(canvas, {
			nodes: remainingNodes,
			edges: reconciliation.edges,
		});

		return reconciliation;
	}

	/**
	 * Decides whether a file is an Excalidraw drawing when its name says nothing.
	 *
	 * Asks the Excalidraw plugin first -- its `isExcalidrawFile()` is the
	 * authority and already handles renames -- then falls back to reading the
	 * frontmatter and tags directly, so a rename is still recognised even if
	 * the plugin's API changes.
	 *
	 * @param file - The file a Canvas node points at.
	 * @returns True when the file is a drawing.
	 */
	private probeDrawing(file: TFile): boolean {
		const plugin = getExcalidrawPlugin(this.app);
		if (typeof plugin?.isExcalidrawFile === "function") {
			try {
				if (plugin.isExcalidrawFile(file)) return true;
			} catch (error) {
				console.error(
					"[canvas-to-excalidraw] " +
						t("log.isExcalidrawFileFailed"),
					error
				);
			}
		}

		try {
			const cache = this.app.metadataCache.getFileCache(file);
			return marksDrawing(cache?.frontmatter, cache?.tags);
		} catch (error) {
			console.error(
				"[canvas-to-excalidraw] " + t("log.readMetadataFailed"),
				error
			);
			return false;
		}
	}

	/**
	 * Loads persisted settings, falling back to defaults for missing or
	 * unusable values.
	 */
	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	/** Persists the current settings. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

/**
 * Derives the raw (unsanitised) name from a node.
 *
 * Text cards contribute their first 10 characters; file nodes contribute their
 * file name without the extension.
 *
 * @param node - The naming node.
 * @returns The raw candidate name.
 */
function deriveRawName(node: CanvasNodeData): string {
	switch (node.type) {
		case "text":
			return deriveNameFromText(node.text ?? "");
		case "file":
			return deriveNameFromFilePath(node.file ?? "");
		case "link":
			return deriveNameFromText(node.url ?? "");
		default:
			return fallbackName();
	}
}

/**
 * Builds the user-facing success message, including anything skipped.
 *
 * @param result - Outcome reported by the Excalidraw bridge.
 * @param name - Final drawing name (before the extension).
 * @param reconciliation - How the Canvas's edges were reconciled.
 * @returns A single-line summary.
 */
function buildSuccessMessage(
	result: DrawingResult,
	name: string,
	reconciliation: EdgeReconciliation
): string {
	const parts: string[] = [];
	if (result.imageCount > 0) {
		parts.push(t("summary.image", { count: result.imageCount }));
	}
	if (result.drawingCount > 0) {
		parts.push(t("summary.drawing", { count: result.drawingCount }));
	}
	if (result.noteCount > 0) {
		parts.push(t("summary.note", { count: result.noteCount }));
	}
	if (result.textCount > 0) {
		parts.push(t("summary.textCard", { count: result.textCount }));
	}
	if (result.arrowCount > 0) {
		parts.push(t("summary.arrow", { count: result.arrowCount }));
	}
	const moved = parts.length > 0 ? parts.join(" + ") : t("summary.none");

	let message = t("summary.moved", { moved, name });

	if (reconciliation.reconnected > 0) {
		message += t("summary.reconnected", {
			count: reconciliation.reconnected,
		});
	}
	if (reconciliation.dropped > 0) {
		message += t("summary.dropped", { count: reconciliation.dropped });
	}
	if (result.skipped.length > 0) {
		message += t("summary.skipped", {
			count: result.skipped.length,
			reasons: result.skipped.join(t("common.listSeparator")),
		});
	}
	return message;
}

/**
 * Turns an unknown thrown value into a readable message.
 *
 * @param error - The caught value.
 * @returns A human-readable description.
 */
function describeError(error: unknown): string {
	if (
		error instanceof NothingToMoveError ||
		error instanceof CanvasUnavailableError
	) {
		return error.message;
	}
	if (error instanceof Error) return error.message;
	return String(error);
}
