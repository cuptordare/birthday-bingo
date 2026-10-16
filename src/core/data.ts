import {
	createLocalSyncApp,
	type KeyValueStore,
	type SyncState,
} from "localsync";
import { loadGameContent } from "./gameContent";
import { createGoogleSheetsSyncAdapter } from "./googleSheetsSyncAdapter";
import type {
	AppDataApi,
	BoardEntry,
	ColumnEntry,
	SyncActivity,
	TaskEntry,
} from "./types";

const backgroundSyncIntervalMs = 10 * 60 * 1000;

const taskId = (key: string) => `task:${key}`;
const columnId = (index: number) => `column:${index}`;

const asTask = (entry: BoardEntry | undefined): TaskEntry | undefined =>
	entry?.kind === "task" ? entry : undefined;
const asColumn = (entry: BoardEntry | undefined): ColumnEntry | undefined =>
	entry?.kind === "column" ? entry : undefined;

const newTask = (key: string): TaskEntry => ({
	kind: "task",
	key,
	completed: false,
	assignedTo: null,
});

const toActivity = (state: SyncState): SyncActivity => ({
	phase: state.phase,
	online: state.online,
	pending: state.pending,
	lastSyncedAt: state.lastSyncedAt,
});

/**
 * Games are joined lazily (one synced key-value store per game code, created on
 * login, not eagerly for every known code at boot) -- a device only ever cares
 * about the party it's attending, so there's no reason to poll every other
 * game's backend row. See plan §3a.
 */
export function createAppData(): AppDataApi {
	const app = createLocalSyncApp({
		name: "birthday-bingo-v1",
		onError(error, info) {
			console.error(
				`Local Sync ${info.source} error (${info.collection})`,
				error,
			);
		},
	});
	const games = new Map<string, KeyValueStore<BoardEntry>>();

	async function ensureGame(code: string): Promise<KeyValueStore<BoardEntry>> {
		let board = games.get(code);
		if (board === undefined) {
			board = app.keyValue<BoardEntry>(`board_${code}`, {
				remote: createGoogleSheetsSyncAdapter<BoardEntry>(`board:${code}`),
				syncIntervalMs: backgroundSyncIntervalMs,
				pushDebounceMs: 900,
			});
			games.set(code, board);
		}
		await board.ready;
		return board;
	}

	async function updateTask(
		code: string,
		key: string,
		change: (task: TaskEntry) => TaskEntry,
	): Promise<void> {
		const board = await ensureGame(code);
		board.update(taskId(key), (entry) => change(asTask(entry) ?? newTask(key)));
	}

	return {
		async loadGame(code) {
			return loadGameContent(code);
		},

		async joinGame(code) {
			await ensureGame(code);
		},

		getTask(code, key) {
			return asTask(games.get(code)?.get(taskId(key)));
		},

		subscribeTask(code, key, listener) {
			const board = games.get(code);
			if (!board) return () => {};
			// Deliberately does NOT fire `listener` immediately with the current
			// value (unlike family-pantry's subscribe*Data helpers) -- callers
			// here (board.ts) always read the current value via getTask/getColumn
			// as part of building content, then subscribe only to be notified of
			// *future* changes. Firing synchronously on subscribe would recurse:
			// board.ts rebuilds its whole subscription set on every render, so an
			// immediate callback would trigger another render from inside the
			// render that created it.
			return board.watch(taskId(key), (entry) => listener(asTask(entry)), {
				immediate: false,
			});
		},

		setTaskCompleted: (code, key, completed) =>
			updateTask(code, key, (task) => ({ ...task, completed })),

		setTaskAssignment: (code, key, assignedTo) =>
			updateTask(code, key, (task) => ({ ...task, assignedTo })),

		failTaskAgenda: (code, key, totalAgendas) =>
			updateTask(code, key, (task) => {
				const index = task.agendaIndex ?? 0;
				return index + 1 < totalAgendas
					? { ...task, agendaIndex: index + 1 }
					: { ...task, agendaExhausted: true };
			}),

		resetTaskAgenda: (code, key) =>
			updateTask(code, key, (task) => ({
				...task,
				completed: false,
				agendaIndex: 0,
				agendaExhausted: false,
			})),

		getColumn(code, index) {
			return asColumn(games.get(code)?.get(columnId(index)));
		},

		subscribeColumn(code, index, listener) {
			const board = games.get(code);
			if (!board) return () => {};
			// See subscribeTask's comment: no immediate synchronous callback.
			return board.watch(
				columnId(index),
				(entry) => listener(asColumn(entry)),
				{
					immediate: false,
				},
			);
		},

		async setColumnRevealed(code, index, revealed) {
			const board = await ensureGame(code);
			board.set(columnId(index), { kind: "column", index, revealed });
		},

		async sync(code) {
			const board = await ensureGame(code);
			await board.engine?.sync();
		},

		subscribeSyncActivity(code, listener) {
			const engine = games.get(code)?.engine;
			if (!engine) {
				listener({
					phase: "idle",
					online: true,
					pending: 0,
					lastSyncedAt: undefined,
				});
				return () => {};
			}
			listener(toActivity(engine.getState()));
			return engine.status.subscribe((state) => listener(toActivity(state)));
		},
	};
}
