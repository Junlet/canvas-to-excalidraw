/**
 * Adapter over Obsidian's *internal* Canvas API.
 *
 * Obsidian ships no public API for Canvas -- `obsidian.d.ts` does not mention
 * it at all -- so every call here targets undocumented internals. To keep that
 * risk contained:
 *
 *   - nothing outside this module touches `canvas.*` directly;
 *   - every member is probed with `typeof ... === "function"` before use, so a
 *     future Obsidian change surfaces as a readable error, not a TypeError;
 *   - `selection` is read defensively because its container type is not
 *     contracted (see {@link readSelectionContainer}).
 */

import type {
	CanvasData,
	CanvasLike,
	CanvasNodeData,
	CanvasNodeInstanceLike,
} from "./types";
import { t } from "./i18n";

/**
 * Bounding box of a set of Canvas nodes, in Canvas coordinates.
 * Canvas coordinates are unbounded and may be negative.
 */
export interface CanvasBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

/**
 * Selectors that indicate a node is currently being text-edited.
 * Mirrors the guard used by the canvas-loom plugin.
 */
const EDITOR_FOCUS_SELECTOR = [
	".cm-focused",
	"textarea:focus",
	"[contenteditable='true']:focus",
].join(", ");

/** Tolerance used when comparing node rows, to absorb float noise. */
const ROW_EPSILON = 1;

/** Thrown when the Canvas internals we need are missing or unresolvable. */
export class CanvasUnavailableError extends Error {}

/**
 * Reports whether an unknown value looks like Canvas node *data*.
 *
 * @param value - Candidate.
 * @returns True when the mandatory geometric fields are all present.
 */
function isNodeData(value: unknown): value is CanvasNodeData {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<CanvasNodeData>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.type === "string" &&
		typeof candidate.x === "number" &&
		typeof candidate.y === "number"
	);
}

/**
 * Recovers node data from either raw data or a live node instance.
 *
 * Exported because the `canvas:node-menu` event hands us a node *instance*,
 * while selection APIs hand us plain data.
 *
 * @param value - Node data or a node instance exposing `getData()`.
 * @returns Node data, or null when it cannot be recovered.
 */
export function readNodeData(value: unknown): CanvasNodeData | null {
	if (isNodeData(value)) return value;
	const instance = value as CanvasNodeInstanceLike | null;
	if (instance && typeof instance.getData === "function") {
		try {
			const data = instance.getData();
			if (isNodeData(data)) return data;
		} catch (error) {
			console.error("[canvas-to-excalidraw] node.getData() failed", error);
		}
	}
	return null;
}

/**
 * Reads the selected nodes from `canvas.getSelectionData()`.
 *
 * This is the preferred path: it hands back plain data in the same shape as a
 * `.canvas` file, so we never have to reason about live instance types.
 *
 * @param canvas - The Canvas instance.
 * @returns Selected node data, or an empty array when unavailable.
 */
function readSelectionData(canvas: CanvasLike): CanvasNodeData[] {
	if (typeof canvas.getSelectionData !== "function") return [];
	try {
		const selection = canvas.getSelectionData();
		const nodes = selection?.nodes;
		if (!Array.isArray(nodes)) return [];
		return nodes.filter(isNodeData);
	} catch (error) {
		console.error(
			"[canvas-to-excalidraw] canvas.getSelectionData() failed",
			error
		);
		return [];
	}
}

/**
 * Reads the selected nodes by walking `canvas.selection`.
 *
 * Fallback for the (unlikely) case where `getSelectionData()` is unavailable.
 * The container has been observed as a `Map` in current builds, but that is not
 * contractual, so both `Map` and `Set` shapes are accepted -- reading a `Map`
 * with `Array.from` would otherwise yield `[key, value]` pairs rather than nodes.
 *
 * @param canvas - The Canvas instance.
 * @returns Selected node data, or an empty array when unavailable.
 */
function readSelectionContainer(canvas: CanvasLike): CanvasNodeData[] {
	const selection = canvas.selection;
	if (!selection || typeof selection !== "object") return [];
	let entries: unknown[];
	try {
		const container = selection as {
			values?: () => Iterable<unknown>;
			[Symbol.iterator]?: () => Iterator<unknown>;
		};
		entries =
			typeof container.values === "function"
				? Array.from(container.values())
				: Array.from(container as Iterable<unknown>);
	} catch (error) {
		console.error(
			"[canvas-to-excalidraw] reading canvas.selection failed",
			error
		);
		return [];
	}
	return entries
		.map(readNodeData)
		.filter((node): node is CanvasNodeData => node !== null);
}

/**
 * Returns the currently selected Canvas nodes as plain data.
 *
 * @param canvas - The Canvas instance.
 * @returns Selected node data (possibly empty).
 */
export function getSelectionNodes(canvas: CanvasLike): CanvasNodeData[] {
	const fromApi = readSelectionData(canvas);
	if (fromApi.length > 0) return fromApi;
	return readSelectionContainer(canvas);
}

/**
 * Reports whether a single node instance is mid-edit.
 *
 * @param node - Node instance from `canvas.nodes`.
 * @returns True when the node has an active text editor.
 */
function isNodeInstanceEditing(node: CanvasNodeInstanceLike): boolean {
	if (!node) return false;
	if (node.isEditing === true) return true;
	const el = node.nodeEl;
	if (!el) return false;
	if (el.classList?.contains("is-editing")) return true;
	return Boolean(el.querySelector?.(EDITOR_FOCUS_SELECTOR));
}

/**
 * Reports whether *any* node on the Canvas is currently being edited.
 *
 * Committing `setData()` while a node has focus would discard whatever the user
 * has typed but not yet committed, so the caller must refuse to run instead.
 *
 * @param canvas - The Canvas instance.
 * @returns True when at least one node is being edited.
 */
export function hasEditingNode(canvas: CanvasLike): boolean {
	const nodes = canvas.nodes;
	if (!(nodes instanceof Map)) return false;
	for (const node of nodes.values()) {
		if (isNodeInstanceEditing(node as CanvasNodeInstanceLike)) return true;
	}
	return false;
}

/**
 * Writes new Canvas data back and persists it.
 *
 * @param canvas - The Canvas instance.
 * @param data - Full replacement Canvas document.
 * @throws {CanvasUnavailableError} When the write API is missing.
 */
export async function commitCanvasData(
	canvas: CanvasLike,
	data: CanvasData
): Promise<void> {
	if (typeof canvas.setData !== "function") {
		throw new CanvasUnavailableError(t("error.canvasSetDataMissing"));
	}
	await canvas.setData(data);
	if (typeof canvas.requestSave === "function") {
		await canvas.requestSave();
	}
}

/**
 * Reads the full Canvas document.
 *
 * @param canvas - The Canvas instance.
 * @returns The Canvas document.
 * @throws {CanvasUnavailableError} When the read API is missing.
 */
export function readCanvasData(canvas: CanvasLike): CanvasData {
	if (typeof canvas.getData !== "function") {
		throw new CanvasUnavailableError(t("error.canvasGetDataMissing"));
	}
	const data = canvas.getData();
	if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
		throw new CanvasUnavailableError(t("error.canvasDataUnrecognized"));
	}
	return data;
}

/**
 * Computes the collective bounding box of a set of nodes.
 *
 * @param nodes - Node data to measure.
 * @returns The bounding box; all zeroes when `nodes` is empty.
 */
export function computeBounds(nodes: CanvasNodeData[]): CanvasBounds {
	if (nodes.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const node of nodes) {
		const width = Number.isFinite(node.width) ? node.width : 0;
		const height = Number.isFinite(node.height) ? node.height : 0;
		minX = Math.min(minX, node.x);
		minY = Math.min(minY, node.y);
		maxX = Math.max(maxX, node.x + width);
		maxY = Math.max(maxY, node.y + height);
	}
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Which node names the drawing when several are selected.
 *
 *   - `topmost`: smallest `y` (ties broken by smaller `x`)
 *   - `leftmost`: smallest `x` (ties broken by smaller `y`)
 */
export type NamingAnchor = "topmost" | "leftmost";

/**
 * Reports whether a value is a recognised naming anchor.
 *
 * @param value - Candidate value.
 * @returns True for `"topmost"` or `"leftmost"`.
 */
export function isNamingAnchor(value: unknown): value is NamingAnchor {
	return value === "topmost" || value === "leftmost";
}

/**
 * Picks the node that names the drawing.
 *
 * Both modes break ties on the other axis, so the choice stays deterministic
 * for nodes aligned in a row or column. Comparisons use a small tolerance so
 * nodes the user aligned by hand are not separated by sub-pixel float noise.
 *
 * @param nodes - Candidate nodes.
 * @param anchor - Whether to favour the topmost or the leftmost node.
 * @returns The winning node, or null when `nodes` is empty.
 */
export function pickNamingNode(
	nodes: CanvasNodeData[],
	anchor: NamingAnchor
): CanvasNodeData | null {
	let best: CanvasNodeData | null = null;
	for (const node of nodes) {
		if (!best) {
			best = node;
			continue;
		}
		const primary = anchor === "leftmost" ? node.x - best.x : node.y - best.y;
		const secondary =
			anchor === "leftmost" ? node.y - best.y : node.x - best.x;

		if (primary < -ROW_EPSILON) {
			best = node;
		} else if (Math.abs(primary) <= ROW_EPSILON && secondary < 0) {
			best = node;
		}
	}
	return best;
}

/**
 * Generates an id for a newly inserted Canvas node.
 *
 * Canvas ids are 16 hex characters. Uniqueness is checked against the ids
 * already present so a (vanishingly unlikely) collision cannot corrupt the
 * document.
 *
 * @param taken - Ids already used in the Canvas document.
 * @returns A fresh, unused id.
 */
export function createCanvasNodeId(taken: Set<string>): string {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const candidate = randomHexId();
		if (!taken.has(candidate)) return candidate;
	}
	throw new CanvasUnavailableError(t("error.nodeIdUnavailable"));
}

/**
 * Produces 16 random hex characters, preferring the platform CSPRNG.
 *
 * @returns A hex id.
 */
function randomHexId(): string {
	const cryptoApi = globalThis.crypto as Crypto | undefined;
	if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
		return cryptoApi.randomUUID().replace(/-/gu, "").slice(0, 16);
	}
	let out = "";
	while (out.length < 16) {
		out += Math.floor(Math.random() * 16).toString(16);
	}
	return out;
}
