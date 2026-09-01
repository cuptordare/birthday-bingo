import type { Mutation, RecordEnvelope, SyncAdapter } from "localsync";
import { APP_DATA_SECRET, APP_DATA_URL } from "./secrets";

interface RemotePayload<T extends object> {
	records: RecordEnvelope<T>[];
}

// v1: schema-version marker for the BoardEntry shape, independent of the
// game `collection` segment. Bump this (and the IndexedDB database name in
// data.ts) together if BoardEntry ever changes incompatibly -- new deploys
// then start writing a fresh sheet row instead of crashing on old-shaped
// data, and the old versioned row is simply abandoned, not migrated. Same
// approach the original Birthday Bingo used for its own `:v2` localStorage
// keys.
function remoteKey(collection: string): string {
	return `birthdayBingo:v1:${collection}:records`;
}

function asRemote<T extends object>(
	record: RecordEnvelope<T>,
): RecordEnvelope<T> {
	return {
		...record,
		meta: {
			...record.meta,
			dirty: false,
			source: "remote",
		},
	};
}

async function sheetsRequest<T>(
	action: "get" | "set",
	id: string,
	data?: T,
): Promise<T | null> {
	const response = await fetch(APP_DATA_URL, {
		method: "POST",
		body: JSON.stringify({
			secret: APP_DATA_SECRET,
			action,
			id,
			data,
		}),
	});

	if (!response.ok) {
		throw new Error(`Google Sheets request failed: ${response.status}`);
	}

	return (await response.json()) as T | null;
}

async function readRemote<T extends object>(
	collection: string,
): Promise<RecordEnvelope<T>[]> {
	const payload = await sheetsRequest<RemotePayload<T> | RecordEnvelope<T>[]>(
		"get",
		remoteKey(collection),
	);
	if (payload === null) return [];
	if (Array.isArray(payload)) return payload.map(asRemote);
	return (payload.records ?? []).map(asRemote);
}

async function writeRemote<T extends object>(
	collection: string,
	records: RecordEnvelope<T>[],
): Promise<void> {
	await sheetsRequest("set", remoteKey(collection), { records });
}

/**
 * One adapter instance per game code (`collection` = `board:{code}`), so
 * each game gets its own spreadsheet row. Within that collection, records
 * are per-task/per-column (see types.ts BoardEntry) -- this adapter's
 * read-modify-write push (re-fetch remote, overwrite only the mutated
 * record ids, write the merged array back) is what makes concurrent
 * players completing different tasks safe: see plan §3a.
 */
export function createGoogleSheetsSyncAdapter<T extends object>(
	collection: string,
): SyncAdapter<T> {
	return {
		async pull() {
			return { records: await readRemote<T>(collection) };
		},

		async push(mutations: Mutation<T>[]) {
			const current = new Map(
				(await readRemote<T>(collection)).map((record) => [record.id, record]),
			);
			const acked: string[] = [];
			const records: RecordEnvelope<T>[] = [];

			for (const mutation of mutations) {
				const authoritative = asRemote(mutation.record);
				current.set(mutation.recordId, authoritative);
				acked.push(mutation.mutationId);
				records.push(authoritative);
			}

			await writeRemote(collection, [...current.values()]);
			return { acked, records };
		},
	};
}
