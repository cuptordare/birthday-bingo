import {
	type Collection,
	createIndexedDBAdapter,
	createLocalSyncApp,
	createNetworkStatus,
	createSyncEngine,
	type SyncEngine,
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

const pushDebounceMs = 900;
const backgroundSyncIntervalMs = 10 * 60 * 1000;

function taskId(key: string): string {
	return `task:${key}`;
}

function columnId(index: number): string {
	return `column:${index}`;
}

function upsert<T extends object>(
	collection: Collection<T>,
	id: string,
	data: T,
): void {
	if (collection.peek(id)) collection.replace(id, data);
	else collection.insert(data, { id });
}

interface GameHandle {
	collection: Collection<BoardEntry>;
	engine: SyncEngine;
	pushTimer: ReturnType<typeof setTimeout> | undefined;
	activityListeners: Set<(activity: SyncActivity) => void>;
}

/**
 * Games are joined lazily (one localsync collection + one SyncEngine per
 * game code, created on login, not eagerly for every known code at boot) --
 * a device only ever cares about the party it's attending, so there's no
 * reason to poll every other game's backend row. See plan §3a.
 */
export function createAppData(): AppDataApi {
	const app = createLocalSyncApp({
		storage: createIndexedDBAdapter({ databaseName: "birthday-bingo-v1" }),
		onError(error) {
			console.error("Local Sync persistence error", error);
		},
	});
	const network = createNetworkStatus();
	const games = new Map<string, GameHandle>();

	function emitActivity(code: string): void {
		const handle = games.get(code);
		if (!handle) return;
		const state = handle.engine.getState();
		const activity: SyncActivity = {
			phase: state.phase,
			online: state.online,
			pending: state.pending,
			lastSyncedAt: state.lastSyncedAt,
		};
		for (const listener of handle.activityListeners) listener(activity);
	}

	async function ensureGame(code: string): Promise<GameHandle> {
		const existing = games.get(code);
		if (existing) return existing;

		const collection = app.collection<BoardEntry>(`board_${code}`);
		await collection.ready;
		const engine = createSyncEngine({
			collection,
			adapter: createGoogleSheetsSyncAdapter<BoardEntry>(`board:${code}`),
			network,
			purgeDeletedOnPush: true,
		});
		const handle: GameHandle = {
			collection,
			engine,
			pushTimer: undefined,
			activityListeners: new Set(),
		};
		games.set(code, handle);
		engine.status.subscribe(() => emitActivity(code));
		engine.start({ intervalMs: backgroundSyncIntervalMs, syncOnStart: true });
		return handle;
	}

	function schedulePush(handle: GameHandle): void {
		if (handle.pushTimer !== undefined) window.clearTimeout(handle.pushTimer);
		handle.pushTimer = window.setTimeout(() => {
			handle.pushTimer = undefined;
			void handle.engine.push().catch((error: unknown) => {
				console.error("push error", error);
			});
		}, pushDebounceMs);
	}

	function readTask(
		handle: GameHandle | undefined,
		key: string,
	): TaskEntry | undefined {
		const data = handle?.collection.peek(taskId(key))?.data;
		return data?.kind === "task" ? data : undefined;
	}

	function readColumn(
		handle: GameHandle | undefined,
		index: number,
	): ColumnEntry | undefined {
		const data = handle?.collection.peek(columnId(index))?.data;
		return data?.kind === "column" ? data : undefined;
	}

	return {
		async loadGame(code) {
			return loadGameContent(code);
		},

		async joinGame(code) {
			await ensureGame(code);
		},

		getTask(code, key) {
			return readTask(games.get(code), key);
		},

		subscribeTask(code, key, listener) {
			const handle = games.get(code);
			if (!handle) return () => {};
			const query = handle.collection.get(taskId(key));
			const read = () => {
				const data = query.getCurrentResult()?.data;
				return data?.kind === "task" ? data : undefined;
			};
			// Deliberately does NOT fire `listener` immediately with the current
			// value (unlike family-pantry's subscribe*Data helpers) -- callers
			// here (board.ts) always read the current value via getTask/getColumn
			// as part of building content, then subscribe only to be notified of
			// *future* changes. Firing synchronously on subscribe would recurse:
			// board.ts rebuilds its whole subscription set on every render, so an
			// immediate callback would trigger another render from inside the
			// render that created it.
			return query.subscribe(() => listener(read()));
		},

		async setTaskCompleted(code, key, completed) {
			const handle = await ensureGame(code);
			const current: TaskEntry = readTask(handle, key) ?? {
				kind: "task",
				key,
				completed: false,
				assignedTo: null,
			};
			upsert(handle.collection, taskId(key), { ...current, completed });
			schedulePush(handle);
		},

		async setTaskAssignment(code, key, assignedTo) {
			const handle = await ensureGame(code);
			const current: TaskEntry = readTask(handle, key) ?? {
				kind: "task",
				key,
				completed: false,
				assignedTo: null,
			};
			upsert(handle.collection, taskId(key), { ...current, assignedTo });
			schedulePush(handle);
		},

		async failTaskAgenda(code, key, totalAgendas) {
			const handle = await ensureGame(code);
			const current: TaskEntry = readTask(handle, key) ?? {
				kind: "task",
				key,
				completed: false,
				assignedTo: null,
			};
			const index = current.agendaIndex ?? 0;
			const next: TaskEntry =
				index + 1 < totalAgendas
					? { ...current, agendaIndex: index + 1 }
					: { ...current, agendaExhausted: true };
			upsert(handle.collection, taskId(key), next);
			schedulePush(handle);
		},

		async resetTaskAgenda(code, key) {
			const handle = await ensureGame(code);
			const current: TaskEntry = readTask(handle, key) ?? {
				kind: "task",
				key,
				completed: false,
				assignedTo: null,
			};
			upsert(handle.collection, taskId(key), {
				...current,
				completed: false,
				agendaIndex: 0,
				agendaExhausted: false,
			});
			schedulePush(handle);
		},

		getColumn(code, index) {
			return readColumn(games.get(code), index);
		},

		subscribeColumn(code, index, listener) {
			const handle = games.get(code);
			if (!handle) return () => {};
			const query = handle.collection.get(columnId(index));
			const read = () => {
				const data = query.getCurrentResult()?.data;
				return data?.kind === "column" ? data : undefined;
			};
			// See subscribeTask's comment: no immediate synchronous callback.
			return query.subscribe(() => listener(read()));
		},

		async setColumnRevealed(code, index, revealed) {
			const handle = await ensureGame(code);
			const entry: ColumnEntry = { kind: "column", index, revealed };
			upsert(handle.collection, columnId(index), entry);
			schedulePush(handle);
		},

		async sync(code) {
			const handle = await ensureGame(code);
			await handle.engine.sync();
		},

		subscribeSyncActivity(code, listener) {
			const handle = games.get(code);
			if (!handle) {
				listener({
					phase: "idle",
					online: true,
					pending: 0,
					lastSyncedAt: undefined,
				});
				return () => {};
			}
			handle.activityListeners.add(listener);
			emitActivity(code);
			return () => {
				handle.activityListeners.delete(listener);
			};
		},
	};
}
