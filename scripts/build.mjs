import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { encryptContent } from "./encryptContent.mjs";

const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const srcDir = path.join(rootDir, "src");
const publicDir = path.join(rootDir, "public");
const distDir = path.join(rootDir, "dist");

const envPath = path.join(rootDir, ".env");
if (existsSync(envPath)) {
	process.loadEnvFile(envPath);
}

for (const name of ["APP_DATA_URL", "APP_DATA_SECRET", "GAME_CONTENT_KEY"]) {
	if (!process.env[name]) {
		throw new Error(
			`Missing required env var ${name}. Copy .env.example to .env and fill in real values (see DEPLOYMENT.md).`,
		);
	}
}

// Re-encrypt from content/games/*.json before building, so dist/ can never
// ship stale ciphertext after a content edit that forgot the manual
// `npm run encrypt-content` step. That directory is gitignored plaintext, so
// it doesn't exist in a CI checkout -- encryptContent() returns null in that
// case, and we fall back to whatever ciphertext is already committed in
// src/games/encrypted/ instead of failing the build.
const encryptedGamesDir = path.join(srcDir, "games", "encrypted");
const encryptedCodes = await encryptContent();
if (encryptedCodes) {
	console.log(
		`Encrypted ${encryptedCodes.length} game(s): ${encryptedCodes.join(", ")}`,
	);
} else {
	console.log(
		"No content/games/ directory found -- using already-committed ciphertext in src/games/encrypted/.",
	);
	if (!existsSync(path.join(encryptedGamesDir, "manifest.json"))) {
		throw new Error(
			`No encrypted game content committed at ${encryptedGamesDir}. Author and encrypt at least one game first (see DEPLOYMENT.md).`,
		);
	}
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await esbuild.build({
	entryPoints: [path.join(srcDir, "main.ts")],
	bundle: true,
	format: "esm",
	target: "es2022",
	sourcemap: false,
	minify: true,
	outfile: path.join(distDir, "app.js"),
	define: {
		"process.env.APP_DATA_URL": JSON.stringify(process.env.APP_DATA_URL),
		"process.env.APP_DATA_SECRET": JSON.stringify(process.env.APP_DATA_SECRET),
		"process.env.GAME_CONTENT_KEY": JSON.stringify(
			process.env.GAME_CONTENT_KEY,
		),
	},
});

await esbuild.build({
	entryPoints: [path.join(srcDir, "app.css")],
	bundle: true,
	minify: true,
	outfile: path.join(distDir, "app.css"),
});

const html = await readFile(path.join(srcDir, "index.html"), "utf8");
await writeFile(path.join(distDir, "index.html"), html, "utf8");

const staticFiles = [
	"manifest.json",
	"sw.js",
	"favicon.ico",
	"favicon-16x16.png",
	"favicon-32x32.png",
	"android-chrome-192x192.png",
	"android-chrome-512x512.png",
	"apple-touch-icon.png",
];

for (const file of staticFiles) {
	await copyFile(path.join(publicDir, file), path.join(distDir, file));
}

await mkdir(path.join(distDir, "games", "encrypted"), { recursive: true });
await cp(encryptedGamesDir, path.join(distDir, "games", "encrypted"), {
	recursive: true,
});

console.log(`Built ${distDir}`);
