import type { GameContent, GameTask, TaskEntry } from "../types";

export interface TaskRenderContext {
	entry: TaskEntry | undefined;
	isHost: boolean;
	game: GameContent;
	/** The roster code this device is signed in as, or null for a host device. */
	selfPlayerCode: string | null;
	/** Display name of the player this task is currently assigned to, or null if unassigned/not assignable. */
	assignedToName: string | null;
	/** Whether this device may complete/reopen this task: always true for the host, and for players only when the task is unassigned or assigned to them. */
	canAct: boolean;
}

export interface TaskActions {
	complete(): void;
	reopen(): void;
	/** SecretAgenda only: the assigned player got noticed -- advance to the next agenda. */
	fail(): void;
	/** SecretAgenda only, host-only: clear progress back to the first agenda. */
	reset(): void;
}

/**
 * The extension point for "each card type gets its own rendering" -- adding
 * a new task type means adding one module implementing this interface and
 * one registerTaskType() call in index.ts; board.ts never needs to change.
 */
export interface TaskTypeRenderer {
	type: string;
	icon: string;
	/** Whether the host can assign this task type to a specific player. Defaults to false. */
	supportsAssignment?: boolean;
	renderTileBadge?(task: GameTask): string | null;
	renderModalBody(
		task: GameTask,
		ctx: TaskRenderContext,
		actions: TaskActions,
	): HTMLElement;
}
