import { STORAGE_KEYS } from "./config";
import type { GameContent, Identity } from "./types";

const HOST_CODE = "HOST";

/** Splits "{GameCode}-{PlayerCode}" on the first "-" (game codes never contain one). */
export function parseLoginInput(
	value: string,
): { gameCode: string; playerCode: string } | null {
	const trimmed = value.trim();
	const dashIndex = trimmed.indexOf("-");
	if (dashIndex <= 0 || dashIndex === trimmed.length - 1) return null;
	const gameCode = trimmed.slice(0, dashIndex).trim().toUpperCase();
	const playerCode = trimmed
		.slice(dashIndex + 1)
		.trim()
		.toUpperCase();
	if (!gameCode || !playerCode) return null;
	return { gameCode, playerCode };
}

export function isHostCode(playerCode: string): boolean {
	return playerCode.toUpperCase() === HOST_CODE;
}

export function checkHostPassword(
	content: GameContent,
	password: string,
): boolean {
	return password === content.hostPasscode;
}

export function resolvePlayerName(
	content: GameContent,
	playerCode: string,
): string | null {
	const upper = playerCode.toUpperCase();
	const entry = Object.entries(content.players).find(
		([code]) => code.toUpperCase() === upper,
	);
	return entry ? entry[1] : null;
}

function identityKey(gameCode: string): string {
	return STORAGE_KEYS.identity.replace("{code}", gameCode);
}

export function getStoredIdentity(gameCode: string): Identity | null {
	const raw = localStorage.getItem(identityKey(gameCode));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Identity;
	} catch {
		return null;
	}
}

export function setStoredIdentity(identity: Identity): void {
	localStorage.setItem(identityKey(identity.code), JSON.stringify(identity));
	setActiveGameCode(identity.code);
}

export function clearStoredIdentity(gameCode: string): void {
	localStorage.removeItem(identityKey(gameCode));
	if (getActiveGameCode() === gameCode) setActiveGameCode(null);
}

export function getActiveGameCode(): string | null {
	return localStorage.getItem(STORAGE_KEYS.activeGame);
}

export function setActiveGameCode(code: string | null): void {
	if (code) localStorage.setItem(STORAGE_KEYS.activeGame, code);
	else localStorage.removeItem(STORAGE_KEYS.activeGame);
}
