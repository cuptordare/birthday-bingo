import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT ?? 4173);

const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
};

createServer((request, response) => {
	const url = new URL(
		request.url ?? "/",
		`http://${request.headers.host ?? "localhost"}`,
	);
	const requestedPath = decodeURIComponent(url.pathname);
	const filePath = path.normalize(
		path.join(distDir, requestedPath === "/" ? "index.html" : requestedPath),
	);

	if (
		!filePath.startsWith(distDir) ||
		!existsSync(filePath) ||
		statSync(filePath).isDirectory()
	) {
		response.writeHead(404);
		response.end("Not found");
		return;
	}

	response.writeHead(200, {
		"Content-Type":
			contentTypes[path.extname(filePath)] ?? "application/octet-stream",
	});
	createReadStream(filePath).pipe(response);
}).listen(port, () => {
	console.log(`Birthday Bingo: http://localhost:${port}/`);
});
