import type { GameContent, GameTask, TaskEntry } from "../types";

export interface TaskRenderContext {
	entry: TaskEntry | undefined;
	isHost: boolean;
	game: GameContent;
	/** The roster code this device is signed in as, or null for a host device. */
	selfPlayerCode: string | null;
}

export interface TaskActions {
	complete(completedBy: string): void;
	reopen(): void;
}

/**
 * The extension point for "each card type gets its own rendering" -- adding
 * a new task type means adding one module implementing this interface and
 * one registerTaskType() call in index.ts; board.ts never needs to change.
 */
export interface TaskTypeRenderer {
	type: string;
	icon: string;
	renderTileBadge?(task: GameTask): string | null;
	renderModalBody(
		task: GameTask,
		ctx: TaskRenderContext,
		actions: TaskActions,
	): HTMLElement;
}
