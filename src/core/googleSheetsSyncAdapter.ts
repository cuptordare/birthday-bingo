import { type BlobSnapshot, createBlobSyncAdapter } from "localsync";
import { APP_DATA_SECRET, APP_DATA_URL } from "./secrets";

// v1: schema-version marker for the BoardEntry shape, independent of the
// game `collection` segment. Bump this (and the IndexedDB database name in
// data.ts) together if BoardEntry ever changes incompatibly -- new deploys
// then start writing a fresh sheet row instead of crashing on old-shaped
// data, and the old versioned row is simply abandoned, not migrated. Same
// approach the original Birthday Bingo used for its own `:v2` localStorage
// keys.
//
// `:lww` rows hold the library's current storage format; the `:records` rows (its old
// format) are only read, to import them once, and are otherwise left as they were -- a
// backup, and still what an old app version reads and writes.
function remoteKey(collection: string): string {
	return `birthdayBingo:v1:${collection}:lww`;
}

function legacyRemoteKey(collection: string): string {
	return `birthdayBingo:v1:${collection}:records`;
}

async function sheetsRequest(
	action: "get" | "set",
	id: string,
	data?: unknown,
	ifMatch?: string,
): Promise<unknown> {
	const response = await fetch(APP_DATA_URL, {
		method: "POST",
		body: JSON.stringify({
			secret: APP_DATA_SECRET,
			action,
			id,
			data,
			ifMatch,
		}),
	});
	if (!response.ok) {
		throw new Error(`Google Sheets request failed: ${response.status}`);
	}
	const body: unknown = await response.json();
	// The Apps Script reports exceptions (e.g. a lock timeout) as a 200 with { error }:
	// treat that as a failure, never as data or as a successful save.
	if (typeof body === "object" && body !== null && "error" in body) {
		throw new Error(`Google Sheets ${action} failed: ${String(body.error)}`);
	}
	return body;
}

/**
 * One adapter per game code (`collection` = `board:{code}`), so each game gets its own
 * spreadsheet row holding all of that game's per-task/per-column records. The library merges
 * every save with what's in the row, per record (so players completing different tasks don't
 * overwrite each other; for the same task, changes to different fields are both kept, and
 * only the same field set two ways goes to the later change). The Apps Script keeps an
 * etag per row and refuses a write whose `ifMatch` is stale, so two pushes landing at the
 * same moment can't erase each other.
 */
export function createGoogleSheetsSyncAdapter<T extends object>(
	collection: string,
) {
	return createBlobSyncAdapter<T>({
		read: async () =>
			(await sheetsRequest(
				"get",
				remoteKey(collection),
			)) as BlobSnapshot<T> | null,
		write: async (blob, { ifMatch }) => {
			const result = (await sheetsRequest(
				"set",
				remoteKey(collection),
				blob,
				ifMatch,
			)) as { conflict?: boolean } | null;
			return result?.conflict === true ? { conflict: true } : undefined;
		},
		legacy: { read: () => sheetsRequest("get", legacyRemoteKey(collection)) },
	});
}
