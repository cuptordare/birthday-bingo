export const APP_NAME = "Birthday Bingo";
export const APP_SHORT_NAME = "Bingo";

export const STORAGE_KEYS = {
	activeGame: "birthdayBingo:activeGame:v1",
	identity: "birthdayBingo:identity:{code}:v1",
	activeTab: "birthdayBingo:tab:{code}:v1",
	acceptedTerms: "birthdayBingo:terms:{code}:v1",
};

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
