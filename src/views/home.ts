import { APP_NAME } from "../core/config";
import { icon } from "../core/helpers";
import {
	checkHostPassword,
	getActiveGameCode,
	getStoredIdentity,
	isHostCode,
	parseLoginInput,
	resolvePlayerName,
	setStoredIdentity,
} from "../core/identity";
import type { AppDataApi, GameContent } from "../core/types";
import { icons } from "../ui/icons";
import { destroyLayoutChrome } from "../ui/layout";
import { showPasswordPrompt } from "../ui/modal";
import type { Router, View } from "../ui/router";

export function createHomeView(data: AppDataApi, router: Router): View {
	let skipToBoard = false;

	return {
		render() {
			destroyLayoutChrome();
			const activeCode = getActiveGameCode();
			skipToBoard = Boolean(activeCode && getStoredIdentity(activeCode));
			if (skipToBoard) {
				return `<section class="home-view"></section>`;
			}

			return `
				<section id="home-view" class="home-view">
					<div class="home-hero">
						<div class="home-logo">${icon(icons.gift, 64)}</div>
						<h1 class="home-title">${APP_NAME}</h1>
						<p class="home-subtitle">Play for prizes!</p>
					</div>
					<div class="home-card">
						<form id="loginForm" class="home-form">
							<div class="home-form__field">
								<label for="loginCode" class="home-form__label">Enter your game code:</label>
								<input id="loginCode" class="home-form__input" type="text" placeholder="" autocomplete="off" autocapitalize="characters" required />
							</div>
							<button type="submit" class="home-form__button"><span>Join Game</span>${icon(icons.arrowRight)}</button>
						</form>
					</div>
				</section>
			`;
		},

		async onMount() {
			if (skipToBoard) {
				await router.navigateTo("board");
				return;
			}

			const form = document.getElementById("loginForm");
			const input = document.getElementById("loginCode");
			if (
				!(form instanceof HTMLFormElement) ||
				!(input instanceof HTMLInputElement)
			)
				return;
			input.focus();

			form.addEventListener("submit", (event) => {
				event.preventDefault();
				void handleSubmit(input, data, router);
			});
			input.addEventListener("input", () => clearError(input));
		},
	};
}

async function handleSubmit(
	input: HTMLInputElement,
	data: AppDataApi,
	router: Router,
): Promise<void> {
	const parsed = parseLoginInput(input.value);
	if (!parsed) {
		showError(input, "Enter your code as GAMECODE-PLAYERCODE");
		return;
	}
	const { gameCode, playerCode } = parsed;

	let content: GameContent;
	try {
		content = await data.loadGame(gameCode);
	} catch {
		showError(input, `Game code "${gameCode}" not found`);
		return;
	}

	if (isHostCode(playerCode)) {
		const success = await showPasswordPrompt({
			title: "Enter the host password:",
			validate: (password) => checkHostPassword(content, password),
		});
		if (!success) return;
		setStoredIdentity({ code: gameCode, playerCode: "HOST", isHost: true });
		await data.joinGame(gameCode);
		await router.navigateTo("board");
		return;
	}

	const name = resolvePlayerName(content, playerCode);
	if (!name) {
		showError(input, "Player code not recognized for this game");
		return;
	}
	setStoredIdentity({ code: gameCode, playerCode, isHost: false });
	await data.joinGame(gameCode);
	await router.navigateTo("board");
}

function showError(input: HTMLInputElement, message: string): void {
	clearError(input);
	input.classList.add("error", "shake");
	const error = document.createElement("div");
	error.className = "home-form__error";
	error.textContent = message;
	input.parentElement?.append(error);
	window.setTimeout(() => input.classList.remove("shake"), 500);
}

function clearError(input: HTMLInputElement): void {
	input.classList.remove("error");
	input.parentElement?.querySelector(".home-form__error")?.remove();
}
