export function byId<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!(element instanceof HTMLElement)) {
		throw new Error(`Missing element #${id}`);
	}
	return element as T;
}

export function icon(path: string, size = 24): string {
	if (!path) return "";
	return `<svg aria-hidden="true" viewBox="0 -960 960 960" width="${size}" height="${size}"><path d="${path}"></path></svg>`;
}

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatRelativeTime(epochMs: number, now = Date.now()): string {
	const diffSeconds = Math.max(0, Math.round((now - epochMs) / 1000));
	if (diffSeconds < 30) return "just now";
	if (diffSeconds < 60) return `${diffSeconds}s ago`;
	const diffMinutes = Math.round(diffSeconds / 60);
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	const diffHours = Math.round(diffMinutes / 60);
	return `${diffHours}h ago`;
}
