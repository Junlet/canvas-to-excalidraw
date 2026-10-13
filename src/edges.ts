/**
 * Edge (arrow) reconciliation when nodes are moved out of a Canvas.
 *
 * A Canvas edge references its endpoints by id (`fromNode` / `toNode`). Once
 * those nodes are deleted, any edge still pointing at them is a dangling
 * reference, so *something* must happen to every affected edge. There are two
 * defensible policies, and the user picks between them:
 *
 *   - `reconnect` (default): an edge with exactly one end inside the moved
 *     content is repointed at the replacement file node. The diagram's topology
 *     survives, which matches the notion that the new drawing *replaces* the
 *     content it absorbed.
 *   - `delete`: such an edge is dropped. The Canvas stays clean, at the cost of
 *     breaking whatever flow passed through the moved nodes.
 *
 * Edges with **both** ends inside the moved content are always dropped under
 * either policy: that relationship is now internal to the drawing.
 *
 * The logic is pure and lives here rather than inline in the plugin so it can be
 * tested against real `.canvas` data.
 */

import type { CanvasEdgeData } from "./types";

/** How edges touching moved nodes are handled. */
export type EdgePolicy = "reconnect" | "delete";

/** Result of reconciling a Canvas's edges against a set of removed nodes. */
export interface EdgeReconciliation {
	/** The surviving, possibly repointed edges, in original order. */
	edges: CanvasEdgeData[];
	/** How many edges were repointed at the replacement node. */
	reconnected: number;
	/** How many edges were removed because an endpoint disappeared. */
	dropped: number;
}

/**
 * Reports whether a value is a recognised edge policy.
 *
 * @param value - Candidate value.
 * @returns True for `"reconnect"` or `"delete"`.
 */
export function isEdgePolicy(value: unknown): value is EdgePolicy {
	return value === "reconnect" || value === "delete";
}

/** One Canvas edge whose endpoints are both being moved. */
export interface InternalEdge {
	/** Canvas id of the source node. */
	from: string;
	/** Canvas id of the target node. */
	to: string;
	/** Canvas side the arrow leaves from, when set. */
	fromSide?: string;
	/** Canvas side the arrow arrives at, when set. */
	toSide?: string;
}

/**
 * Collects the edges that live entirely inside the moved selection.
 *
 * These are exactly the edges that would otherwise be destroyed, and they are
 * the ones worth recreating *inside* the new drawing so a flow keeps its shape
 * after the move. Edges with an endpoint outside the selection stay on the
 * Canvas and are handled by {@link reconcileEdges} instead.
 *
 * Self-loops are skipped: an arrow from a node to itself has no useful
 * Excalidraw equivalent and `connectObjects` requires two distinct elements.
 *
 * @param edges - The Canvas's current edges.
 * @param selectedIds - Ids of the nodes being moved.
 * @returns Internal edges in their original order.
 */
export function selectInternalEdges(
	edges: CanvasEdgeData[],
	selectedIds: Set<string>
): InternalEdge[] {
	const result: InternalEdge[] = [];
	for (const edge of edges) {
		if (edge.fromNode === edge.toNode) continue;
		if (!selectedIds.has(edge.fromNode)) continue;
		if (!selectedIds.has(edge.toNode)) continue;
		result.push({
			from: edge.fromNode,
			to: edge.toNode,
			fromSide: typeof edge.fromSide === "string" ? edge.fromSide : undefined,
			toSide: typeof edge.toSide === "string" ? edge.toSide : undefined,
		});
	}
	return result;
}

/**
 * Rewrites a Canvas's edges after `removedIds` have been deleted and replaced
 * by a single node.
 *
 * @param edges - The Canvas's current edges.
 * @param removedIds - Ids of the nodes being deleted.
 * @param replacementId - Id of the node taking their place.
 * @param policy - Whether surviving external edges are repointed or dropped.
 * @returns The new edge list plus counts for user feedback.
 */
export function reconcileEdges(
	edges: CanvasEdgeData[],
	removedIds: Set<string>,
	replacementId: string,
	policy: EdgePolicy
): EdgeReconciliation {
	const kept: CanvasEdgeData[] = [];
	let reconnected = 0;
	let dropped = 0;

	for (const edge of edges) {
		const fromRemoved = removedIds.has(edge.fromNode);
		const toRemoved = removedIds.has(edge.toNode);

		// Untouched edge: pass through by reference.
		if (!fromRemoved && !toRemoved) {
			kept.push(edge);
			continue;
		}

		// Both ends moved: the relationship is now inside the drawing itself.
		if (fromRemoved && toRemoved) {
			dropped += 1;
			continue;
		}

		if (policy === "delete") {
			dropped += 1;
			continue;
		}

		// Exactly one end moved: repoint that end at the replacement node.
		const repointed: CanvasEdgeData = { ...edge };
		if (fromRemoved) {
			repointed.fromNode = replacementId;
			// The end is attached to a real node again, so it is not floating.
			repointed.fromFloating = false;
		} else {
			repointed.toNode = replacementId;
			repointed.toFloating = false;
		}
		reconnected += 1;
		kept.push(repointed);
	}

	return { edges: kept, reconnected, dropped };
}
