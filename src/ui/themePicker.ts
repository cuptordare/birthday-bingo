import {
	applyTheme,
	getStoredThemeId,
	setStoredThemeId,
	THEMES,
} from "../core/config";

/** Renders theme swatches into `container`. Selection is device-local only (localStorage), never synced. */
export function renderThemePicker(container: HTMLElement): void {
	const current = getStoredThemeId();
	container.className = "theme-picker";
	container.innerHTML = `
		<div class="theme-picker__label">Theme</div>
		<div class="theme-picker__swatches"></div>
	`;
	const swatchesEl = container.querySelector(
		".theme-picker__swatches",
	) as HTMLElement;

	for (const theme of THEMES) {
		const swatch = document.createElement("button");
		swatch.type = "button";
		swatch.className = "theme-swatch";
		swatch.setAttribute("aria-pressed", String(theme.id === current));
		swatch.title = theme.label;
		swatch.style.background = theme.vars["--app-primary"] ?? "#6200ee";
		swatch.addEventListener("click", () => {
			setStoredThemeId(theme.id);
			applyTheme(theme.id);
			for (const el of swatchesEl.querySelectorAll(".theme-swatch")) {
				el.setAttribute("aria-pressed", String(el === swatch));
			}
		});
		swatchesEl.append(swatch);
	}
}
