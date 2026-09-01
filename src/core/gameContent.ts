import { GAME_CONTENT_KEY } from "./secrets";
import type { GameContent } from "./types";

interface EncryptedPayload {
	iv: string;
	ciphertext: string;
	authTag: string;
}

const cache = new Map<string, GameContent>();
let keyPromise: Promise<CryptoKey> | undefined;

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
	// .slice() forces a real (non-shared, non-generic) ArrayBuffer-backed copy,
	// which is what WebCrypto's BufferSource types require.
	return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)).slice();
}

function importKey(): Promise<CryptoKey> {
	keyPromise ??= crypto.subtle.importKey(
		"raw",
		fromBase64(GAME_CONTENT_KEY),
		"AES-GCM",
		false,
		["decrypt"],
	);
	return keyPromise;
}

/**
 * Fetches, decrypts, and caches a game's content. The encrypted JSON is a
 * static asset (src/games/encrypted/{code}.json -> dist/games/encrypted/),
 * so once the PWA's service worker has cached it, this works offline too --
 * the in-memory cache here is only a same-session optimization. Throws if
 * the game code doesn't exist (a 404 fetch) or decryption fails (wrong key
 * or corrupted ciphertext).
 */
export async function loadGameContent(code: string): Promise<GameContent> {
	const cached = cache.get(code);
	if (cached) return cached;

	const response = await fetch(`./games/encrypted/${code}.json`);
	if (!response.ok) {
		throw new Error(`Game code "${code}" not found`);
	}

	const payload = (await response.json()) as EncryptedPayload;
	const key = await importKey();
	const iv = fromBase64(payload.iv);
	const ciphertext = fromBase64(payload.ciphertext);
	const authTag = fromBase64(payload.authTag);

	// WebCrypto's AES-GCM decrypt expects the auth tag appended to the
	// ciphertext; Node's `crypto` (used by scripts/encryptContent.mjs)
	// exposes them separately via cipher.getAuthTag(), so we recombine here.
	const combined = new Uint8Array(ciphertext.length + authTag.length);
	combined.set(ciphertext, 0);
	combined.set(authTag, ciphertext.length);

	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		key,
		combined,
	);
	const content = JSON.parse(
		new TextDecoder().decode(plaintext),
	) as GameContent;
	cache.set(code, content);
	return content;
}

export async function isKnownGameCode(code: string): Promise<boolean> {
	try {
		await loadGameContent(code);
		return true;
	} catch {
		return false;
	}
}
