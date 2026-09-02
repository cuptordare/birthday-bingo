import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Authoring -> ciphertext pipeline for game content. content/games/*.json is
// hand-authored, gitignored plaintext; encryptContent() encrypts each file
// with GAME_CONTENT_KEY (AES-256-GCM) and writes the ciphertext to
// src/games/encrypted/*.json, which IS committed -- it's the only place game
// content exists in the repo. See DEPLOYMENT.md and plan §2 for the full
// rationale (this stops casual GitHub browsing, not a determined inspection
// of the running app -- the key ships in the built client bundle too).
//
// Called automatically by scripts/build.mjs (so `npm run build` can never
// ship stale ciphertext after a content edit) and also runnable standalone
// via `npm run encrypt-content` for a quick re-encrypt without a full build.

const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const contentDir = path.join(rootDir, "content", "games");
const outDir = path.join(rootDir, "src", "games", "encrypted");

function validateContent(code, content) {
	if (!content.hostPasscode) {
		throw new Error(`${code}: missing required "hostPasscode"`);
	}
	const players = content.players ?? {};
	for (const playerCode of Object.keys(players)) {
		if (playerCode.toUpperCase() === "HOST") {
			throw new Error(
				`${code}: "HOST" is a reserved player code and cannot appear in "players"`,
			);
		}
	}
	for (const column of content.columns ?? []) {
		for (const task of column.tasks ?? []) {
			if (
				task.assignedTo &&
				!Object.keys(players).some(
					(playerCode) =>
						playerCode.toUpperCase() === String(task.assignedTo).toUpperCase(),
				)
			) {
				throw new Error(
					`${code}: task "assignedTo": "${task.assignedTo}" is not a key in "players"`,
				);
			}
		}
	}
}

function encrypt(plaintext, key) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();
	return {
		iv: iv.toString("base64"),
		ciphertext: ciphertext.toString("base64"),
		authTag: authTag.toString("base64"),
	};
}

/**
 * Encrypts every content/games/*.json into src/games/encrypted/*.json plus a
 * manifest. Requires GAME_CONTENT_KEY already set in process.env (callers
 * are responsible for loading .env first). Returns the sorted list of game
 * codes that were encrypted, or `null` if content/games/ doesn't exist at
 * all -- expected in CI, where that gitignored directory is never checked
 * out; callers should fall back to whatever ciphertext is already committed
 * in src/games/encrypted/ (see build.mjs).
 */
export async function encryptContent() {
	const keyB64 = process.env.GAME_CONTENT_KEY;
	if (!keyB64) {
		throw new Error(
			"Missing GAME_CONTENT_KEY. Copy .env.example to .env and fill in a generated key (see DEPLOYMENT.md).",
		);
	}
	const key = Buffer.from(keyB64, "base64");
	if (key.length !== 32) {
		throw new Error(
			"GAME_CONTENT_KEY must decode to exactly 32 bytes (AES-256). Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
		);
	}

	if (!existsSync(contentDir)) {
		return null;
	}

	await mkdir(outDir, { recursive: true });
	const files = (await readdir(contentDir)).filter((file) =>
		file.endsWith(".json"),
	);

	if (files.length === 0) {
		throw new Error(
			`No game content found in ${contentDir}. Author at least one {CODE}.json file first.`,
		);
	}

	const codes = [];
	for (const file of files) {
		const code = file.replace(/\.json$/, "");
		const raw = await readFile(path.join(contentDir, file), "utf8");
		const content = JSON.parse(raw);
		content.code = code;
		validateContent(code, content);
		const encrypted = encrypt(JSON.stringify(content), key);
		await writeFile(
			path.join(outDir, `${code}.json`),
			JSON.stringify(encrypted),
			"utf8",
		);
		codes.push(code);
	}

	codes.sort();
	await writeFile(
		path.join(outDir, "manifest.json"),
		`${JSON.stringify({ codes }, null, 2)}\n`,
		"utf8",
	);

	return codes;
}

const isMain =
	process.argv[1] !== undefined &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	const envPath = path.join(rootDir, ".env");
	if (existsSync(envPath)) {
		process.loadEnvFile(envPath);
	}
	const codes = await encryptContent();
	if (!codes) {
		throw new Error(
			`No content directory found at ${contentDir}. Author at least one {CODE}.json file first (see DEPLOYMENT.md).`,
		);
	}
	console.log(`Encrypted ${codes.length} game(s): ${codes.join(", ")}`);
}
