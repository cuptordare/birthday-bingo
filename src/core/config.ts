export const APP_NAME = "Birthday Bingo";
export const APP_SHORT_NAME = "Bingo";

export const STORAGE_KEYS = {
	activeGame: "birthdayBingo:activeGame:v1",
	identity: "birthdayBingo:identity:{code}:v1",
	activeTab: "birthdayBingo:tab:{code}:v1",
	acceptedTerms: "birthdayBingo:terms:{code}:v1",
	theme: "birthdayBingo:theme:v1",
};

export interface Theme {
	id: string;
	label: string;
	vars: Record<string, string>;
}

export const THEMES: Theme[] = [
	{
		id: "classic",
		label: "Classic Party",
		vars: {
			"--app-bg": "#f5f0ff",
			"--app-surface": "#fbf8ff",
			"--app-surface-strong": "#ffffff",
			"--app-text-color": "#241f2f",
			"--app-muted": "#6e647c",
			"--app-border": "#ddd2ec",
			"--app-primary": "#6200ee",
			"--app-primary-dark": "#4300a3",
			"--app-accent": "#b83280",
		},
	},
	{
		id: "midnight",
		label: "Midnight",
		vars: {
			"--app-bg": "#161320",
			"--app-surface": "#1f1b2e",
			"--app-surface-strong": "#241f38",
			"--app-text-color": "#f1edfb",
			"--app-muted": "#a99fc2",
			"--app-border": "#38315090",
			"--app-primary": "#9a6dff",
			"--app-primary-dark": "#7a4ee0",
			"--app-accent": "#ff6fa5",
		},
	},
	{
		id: "pastel",
		label: "Pastel Picnic",
		vars: {
			"--app-bg": "#fbfdf6",
			"--app-surface": "#ffffff",
			"--app-surface-strong": "#ffffff",
			"--app-text-color": "#2e3a2c",
			"--app-muted": "#78876f",
			"--app-border": "#dcecd0",
			"--app-primary": "#4f9d69",
			"--app-primary-dark": "#357a4c",
			"--app-accent": "#e69a5c",
		},
	},
	{
		id: "neon",
		label: "Neon Bash",
		vars: {
			"--app-bg": "#0c0a1a",
			"--app-surface": "#161228",
			"--app-surface-strong": "#1c1732",
			"--app-text-color": "#f4f2ff",
			"--app-muted": "#a89ee0",
			"--app-border": "#3a2f6690",
			"--app-primary": "#ff2fb0",
			"--app-primary-dark": "#c4127f",
			"--app-accent": "#2fe6ff",
		},
	},
];

const DEFAULT_THEME_ID = "classic";

export function getStoredThemeId(): string {
	const id = localStorage.getItem(STORAGE_KEYS.theme);
	return THEMES.some((theme) => theme.id === id)
		? (id as string)
		: DEFAULT_THEME_ID;
}

export function setStoredThemeId(id: string): void {
	localStorage.setItem(STORAGE_KEYS.theme, id);
}

export function applyTheme(id: string): void {
	document.documentElement.setAttribute("data-theme", id);
}

export function getLastActiveTab(code: string): "board" | "list" {
	const key = STORAGE_KEYS.activeTab.replace("{code}", code);
	return localStorage.getItem(key) === "list" ? "list" : "board";
}

export function setLastActiveTab(code: string, tab: "board" | "list"): void {
	const key = STORAGE_KEYS.activeTab.replace("{code}", code);
	localStorage.setItem(key, tab);
}

export function getHasAcceptedTerms(code: string): boolean {
	const key = STORAGE_KEYS.acceptedTerms.replace("{code}", code);
	return localStorage.getItem(key) === "1";
}

export function setHasAcceptedTerms(code: string, accepted: boolean): void {
	const key = STORAGE_KEYS.acceptedTerms.replace("{code}", code);
	if (accepted) localStorage.setItem(key, "1");
	else localStorage.removeItem(key);
}
