export type RouteName = "home" | "board";

export interface TriviaQuestion {
	question: string;
	answer: string;
}

export interface GameTask {
	type: string;
	message: string;
	assignedTo?: string | null;
	trivia?: TriviaQuestion[];
}

export interface GameColumn {
	tasks: GameTask[];
	prize: string;
}

export interface GamePenalty {
	message: string;
}

/** Decrypted, parsed game content -- see content/games/*.json for the authoring schema. */
export interface GameContent {
	code: string;
	rules: string;
	hostPasscode: string;
	/** playerCode (e.g. "SW") -> display name (e.g. "Scott"). Never contains a "HOST" key. */
	players: Record<string, string>;
	columns: GameColumn[];
	penalties: GamePenalty[];
}

/** One synced record per task. id = `task:{colIdx}-{taskIdx}`. */
export interface TaskEntry {
	kind: "task";
	key: string;
	completed: boolean;
	completedBy: string | null;
	/** Host-set override. null falls back to the task's content-authored `assignedTo`. */
	assignedTo: string | null;
}

/** One synced record per column. id = `column:{colIdx}`. */
export interface ColumnEntry {
	kind: "column";
	index: number;
	revealed: boolean;
}

/**
 * Per-game collection entry type. Deliberately one record per task/column
 * (not one record for the whole board) so concurrent writers touching
 * different tasks never clobber each other's changes -- see plan §3a.
 */
export type BoardEntry = TaskEntry | ColumnEntry;

export interface Identity {
	code: string;
	playerCode: string;
	isHost: boolean;
}

export interface SyncActivity {
	phase: "idle" | "syncing" | "error";
	online: boolean;
	pending: number;
	lastSyncedAt: number | undefined;
}

export interface AppDataApi {
	/** Fetch + decrypt a game's content (cached after first load). */
	loadGame(code: string): Promise<GameContent>;
	/** Lazily create/start this game's sync collection + engine. Idempotent. */
	joinGame(code: string): Promise<void>;

	getTask(code: string, key: string): TaskEntry | undefined;
	subscribeTask(
		code: string,
		key: string,
		listener: (entry: TaskEntry | undefined) => void,
	): () => void;
	setTaskCompleted(
		code: string,
		key: string,
		completed: boolean,
		completedBy: string | null,
	): Promise<void>;
	setTaskAssignment(
		code: string,
		key: string,
		assignedTo: string | null,
	): Promise<void>;

	getColumn(code: string, index: number): ColumnEntry | undefined;
	subscribeColumn(
		code: string,
		index: number,
		listener: (entry: ColumnEntry | undefined) => void,
	): () => void;
	revealColumn(code: string, index: number): Promise<void>;

	sync(code: string): Promise<void>;
	subscribeSyncActivity(
		code: string,
		listener: (activity: SyncActivity) => void,
	): () => void;
}
