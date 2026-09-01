// Real values come from .env locally (see .env.example) and from GitHub
// Actions repository secrets in CI (see DEPLOYMENT.md). esbuild replaces
// these process.env references with string literals at build time, so
// no `process` global exists at runtime.
declare const process: { env: Record<string, string | undefined> };

export const APP_DATA_URL = process.env.APP_DATA_URL as string;
export const APP_DATA_SECRET = process.env.APP_DATA_SECRET as string;
export const GAME_CONTENT_KEY = process.env.GAME_CONTENT_KEY as string;
