/**
 * Shared shapes for the two undocumented surfaces this plugin bridges:
 * Obsidian's Canvas internals and the Excalidraw plugin's ExcalidrawAutomate.
 *
 * Everything here is deliberately permissive (`[key: string]: unknown`). Canvas
 * has no public API contract, so we model only the fields we actually read and
 * guard every call site at runtime rather than trusting these declarations.
 */

import type { TFile } from "obsidian";

/** Node kinds Obsidian's Canvas can hold. */
export type CanvasNodeType = "text" | "file" | "link" | "group";

/** One Canvas node, as returned by `canvas.getData()` / `getSelectionData()`. */
export interface CanvasNodeData {
	id: string;
	type: CanvasNodeType;
	x: number;
	y: number;
	width: number;
	height: number;
	/** Present on `text` nodes: the card's body text. */
	text?: string;
	/** Present on `file` nodes: vault-relative path of the referenced file. */
	file?: string;
	/** Present on `link` nodes: the external URL. */
	url?: string;
	/** Present on `group` nodes: label and background. */
	label?: string;
	[key: string]: unknown;
}

/** One Canvas edge. Node ids are referenced via `fromNode` / `toNode`. */
export interface CanvasEdgeData {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: string;
	toSide?: string;
	[key: string]: unknown;
}

/** The whole Canvas document, same shape as a `.canvas` file on disk. */
export interface CanvasData {
	nodes: CanvasNodeData[];
	edges: CanvasEdgeData[];
}

/**
 * The subset of Obsidian's internal Canvas object we depend on.
 * Every member is optional on purpose: we probe with `typeof === "function"`
 * before calling, so an Obsidian update degrades to a clear error instead of
 * a crash.
 */
export interface CanvasLike {
	selection?: unknown;
	nodes?: Map<string, unknown>;
	readonly?: boolean;
	getData?(): CanvasData;
	setData?(data: CanvasData): Promise<void> | void;
	requestSave?(): Promise<void> | void;
	getSelectionData?(): CanvasData;
}

/**
 * The subset of a node *instance* (as opposed to node *data*) we depend on.
 * Used only for the edit-in-progress guard.
 */
export interface CanvasNodeInstanceLike {
	isEditing?: boolean;
	nodeEl?: HTMLElement | null;
	getData?(): CanvasNodeData;
}

/** A menu handed to us by `canvas:node-menu` / `canvas:selection-menu`. */
export interface CanvasMenuItemLike {
	setTitle(title: string): CanvasMenuItemLike;
	setIcon(icon: string): CanvasMenuItemLike;
	setSection?(section: string): CanvasMenuItemLike;
	onClick(callback: (evt: MouseEvent) => unknown): CanvasMenuItemLike;
}

export interface CanvasMenuLike {
	addItem(build: (item: CanvasMenuItemLike) => unknown): unknown;
}

/** A mutable Excalidraw scene element, as exposed on the EA workbench. */
export interface ExcalidrawElementLike {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	[key: string]: unknown;
}

/**
 * Where an arrow attaches to an element.
 *
 * Deliberately identical to Obsidian Canvas's `fromSide` / `toSide` values, so
 * a Canvas edge's sides can be handed to Excalidraw unchanged. `null` lets
 * Excalidraw pick the shortest route between the two element centres.
 */
export type ConnectionPointLike = "top" | "bottom" | "left" | "right" | null;

/**
 * The subset of ExcalidrawAutomate this plugin calls.
 *
 * Obtained per-operation via `excalidrawPlugin.ea.getAPI()`, which the
 * Excalidraw plugin documents as the supported path for *other plugins* and
 * which returns a fresh, dedicated instance (no `reset()` needed, no
 * interference with an open drawing or `window.ExcalidrawAutomate`).
 */
export interface ExcalidrawAutomateLike {
	/** Discards the in-memory workbench. Does not touch any scene. */
	clear(): void;
	/** Stages an image element. Resolves to the new element's id. */
	addImage(
		topX: number,
		topY: number,
		imageFile: unknown,
		scale?: boolean,
		anchor?: boolean
	): Promise<string>;
	/** Stages a text element. Returns the new element's id. */
	addText(
		topX: number,
		topY: number,
		text: string,
		formatting?: Record<string, unknown>,
		id?: string
	): string;
	/** Reads a staged element by id so its geometry can be adjusted. */
	getElement(id: string): ExcalidrawElementLike | undefined;
	/**
	 * Stages an arrow bound between two already-staged elements.
	 *
	 * Operates purely on the workbench, so it needs no Excalidraw view. Returns
	 * the arrow's element id, or `undefined` when either endpoint is missing
	 * from the workbench (the declared return type is optimistic).
	 */
	connectObjects(
		objectA: string,
		connectionA: ConnectionPointLike,
		objectB: string,
		connectionB: ConnectionPointLike,
		formatting?: {
			numberOfPoints?: number;
			startArrowHead?: string | null;
			endArrowHead?: string | null;
			padding?: number;
		}
	): string | undefined;
	/** Writes the workbench out to a new drawing file; resolves to its path. */
	create(params?: {
		filename?: string;
		foldername?: string;
		exactPath?: string;
		templatePath?: string;
		onNewPane?: boolean;
		silent?: boolean;
		frontmatterKeys?: Record<string, string | number | boolean | undefined>;
		plaintext?: string;
	}): Promise<string>;
	style: Record<string, unknown>;
}

/** The Excalidraw plugin instance, reached through `app.plugins.plugins`. */
export interface ExcalidrawPluginLike {
	ea?: { getAPI(view?: unknown): ExcalidrawAutomateLike };
	settings?: { folder?: string };
	/**
	 * Excalidraw's own drawing test.
	 *
	 * Checks the `.excalidraw` extension, then the `excalidraw-plugin`
	 * frontmatter key, then its internal file cache -- so it already survives a
	 * rename, which a filename check cannot.
	 */
	isExcalidrawFile?(file: TFile): boolean;
}
