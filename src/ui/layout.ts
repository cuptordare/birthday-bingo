import { formatRelativeTime, icon } from "../core/helpers";
import { clearStoredIdentity } from "../core/identity";
import type { AppDataApi, GameContent, SyncActivity } from "../core/types";
import { icons } from "./icons";
import { showAlert, showConfirm } from "./modal";
import type { Router } from "./router";

let activeMenu: HamburgerMenu | null = null;
let activeTitleCleanup: (() => void) | null = null;

export function destroyLayoutChrome(): void {
	activeMenu?.destroy();
	activeMenu = null;
	activeTitleCleanup?.();
	activeTitleCleanup = null;
}

export function titleBar({
	code,
	game,
	isHost,
	playerName,
	data,
	router,
}: {
	code: string;
	game: GameContent;
	isHost: boolean;
	playerName: string | null;
	data: AppDataApi;
	router: Router;
}): HTMLElement {
	destroyLayoutChrome();
	const el = document.createElement("div");
	el.className = "view-title-bar";

	const menu = new HamburgerMenu(code, game, isHost, playerName, data, router);
	activeMenu = menu;
	el.append(menu.build());

	const syncStatus = document.createElement("div");
	syncStatus.className = "sync-status";
	syncStatus.innerHTML = `<span class="sync-indicator"></span><span class="sync-status__text"></span>`;
	const indicatorEl = syncStatus.querySelector(
		".sync-indicator",
	) as HTMLElement;
	const textEl = syncStatus.querySelector(".sync-status__text") as HTMLElement;
	el.append(syncStatus);

	const render = (activity: SyncActivity): void => {
		indicatorEl.classList.toggle(
			"sync-indicator--active",
			activity.phase === "syncing",
		);
		if (!activity.online) textEl.textContent = "Offline";
		else if (activity.phase === "syncing") textEl.textContent = "Syncing…";
		else if (activity.phase === "error")
			textEl.textContent = "Sync failed -- will retry";
		else if (activity.lastSyncedAt)
			textEl.textContent = `Synced ${formatRelativeTime(activity.lastSyncedAt)}`;
		else textEl.textContent = "Not synced yet";
	};
	let lastActivity: SyncActivity = {
		phase: "idle",
		online: true,
		pending: 0,
		lastSyncedAt: undefined,
	};
	const unsubscribeActivity = data.subscribeSyncActivity(code, (activity) => {
		lastActivity = activity;
		render(activity);
	});
	const tickTimer = window.setInterval(() => render(lastActivity), 30_000);

	const refreshBtn = document.createElement("button");
	refreshBtn.className = "refresh-btn secondary";
	refreshBtn.innerHTML = icon(icons.sync, 18);
	refreshBtn.setAttribute("aria-label", "Refresh");
	refreshBtn.addEventListener("click", () => {
		void data.sync(code);
	});
	el.append(refreshBtn);

	if (game.penalties.length > 0) {
		const penaltyBtn = document.createElement("button");
		penaltyBtn.className = "penalty-btn";
		penaltyBtn.textContent = "Penalty";
		penaltyBtn.addEventListener("click", () => {
			const index = Math.floor(Math.random() * game.penalties.length);
			void showAlert(game.penalties[index]?.message ?? "");
		});
		el.append(penaltyBtn);
	}

	activeTitleCleanup = () => {
		unsubscribeActivity();
		window.clearInterval(tickTimer);
	};

	return el;
}

class HamburgerMenu {
	private isOpen = false;
	private button: HTMLButtonElement | null = null;
	private sidebar: HTMLElement | null = null;
	private overlay: HTMLElement | null = null;
	private readonly escapeHandler = (event: KeyboardEvent): void => {
		if (event.key === "Escape") this.hide();
	};

	constructor(
		private readonly code: string,
		private readonly game: GameContent,
		private readonly isHost: boolean,
		private readonly playerName: string | null,
		private readonly data: AppDataApi,
		private readonly router: Router,
	) {}

	build(): HTMLButtonElement {
		this.button = document.createElement("button");
		this.button.className = "hamburger-btn";
		this.button.setAttribute("aria-label", "Open menu");
		this.button.innerHTML = icon(icons.menu);

		this.overlay = document.createElement("div");
		this.overlay.className = "sidebar-overlay";
		document.body.append(this.overlay);

		this.sidebar = this.buildSidebar();
		document.body.append(this.sidebar);

		this.button.addEventListener("click", () =>
			this.isOpen ? this.hide() : this.show(),
		);
		this.overlay.addEventListener("click", () => this.hide());
		document.addEventListener("keydown", this.escapeHandler);

		return this.button;
	}

	destroy(): void {
		document.removeEventListener("keydown", this.escapeHandler);
		this.button?.remove();
		this.sidebar?.remove();
		this.overlay?.remove();
	}

	private show(): void {
		this.isOpen = true;
		this.button?.classList.add("open");
		this.sidebar?.classList.add("open");
		this.overlay?.classList.add("open");
	}

	private hide(): void {
		this.isOpen = false;
		this.button?.classList.remove("open");
		this.sidebar?.classList.remove("open");
		this.overlay?.classList.remove("open");
	}

	private buildSidebar(): HTMLElement {
		const sidebar = document.createElement("nav");
		sidebar.className = "sidebar left";
		const label = this.isHost ? "Host" : (this.playerName ?? "Player");
		sidebar.innerHTML = `
			<div class="user">
				<div class="user-bubble">${label.slice(0, 2).toUpperCase()}</div>
				<div class="user-info">
					<div class="user-name">${label}</div>
					<div class="user-nickname">${this.code}${this.isHost ? " · Host" : ""}</div>
				</div>
			</div>
			<button class="sidebar-action" data-action="rules">${icon(icons.list, 18)} View Rules</button>
			<button class="sidebar-action" data-action="sync">${icon(icons.sync, 18)} Sync Now</button>
			<button class="sidebar-action" data-action="switch">${icon(icons.swap, 18)} Switch Game / Player</button>
		`;

		sidebar.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const action =
				target.closest<HTMLElement>("[data-action]")?.dataset.action;
			if (action === "rules") {
				this.hide();
				void showAlert(this.game.rules, "Close");
			} else if (action === "sync") {
				this.hide();
				void this.data.sync(this.code);
			} else if (action === "switch") {
				this.hide();
				void showConfirm("Switch to a different game or player?").then(
					(confirmed) => {
						if (!confirmed) return;
						clearStoredIdentity(this.code);
						void this.router.navigateTo("home");
					},
				);
			}
		});
		return sidebar;
	}
}
