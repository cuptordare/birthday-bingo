import {
	getHasAcceptedTerms,
	getLastActiveTab,
	setHasAcceptedTerms,
	setLastActiveTab,
} from "../core/config";
import { byId, icon } from "../core/helpers";
import {
	clearStoredIdentity,
	getActiveGameCode,
	getStoredIdentity,
	resolvePlayerName,
} from "../core/identity";
import { getTaskTypeRenderer } from "../core/taskTypes";
import type {
	TaskActions,
	TaskRenderContext,
} from "../core/taskTypes/registry-types";
import type {
	AppDataApi,
	GameColumn,
	GameContent,
	GameTask,
	Identity,
	TaskEntry,
} from "../core/types";
import { icons } from "../ui/icons";
import { destroyLayoutChrome, titleBar } from "../ui/layout";
import { showAlert, showConfirm } from "../ui/modal";
import type { Router, View } from "../ui/router";

const COLUMN_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

export function createBoardView(data: AppDataApi, router: Router): View {
	let impl: BoardViewImpl | null = null;

	return {
		render() {
			destroyLayoutChrome();
			const code = getActiveGameCode();
			const identity = code ? getStoredIdentity(code) : null;
			const container = document.createElement("section");
			container.className = "board-view";

			if (!code || !identity) {
				impl = null;
				void router.navigateTo("home");
				return container;
			}

			impl = new BoardViewImpl(data, router, container, identity);
			return container;
		},

		async onMount() {
			if (!impl) return;
			try {
				await impl.init();
				impl.render();
			} catch (error) {
				console.error("Failed to load game", error);
				clearStoredIdentity(impl.code);
				await router.navigateTo("home");
			}
		},

		onDestroy() {
			impl?.destroy();
			impl = null;
		},
	};
}

class BoardViewImpl {
	readonly code: string;
	private game!: GameContent;
	private activeTab: "board" | "list";
	private unsubscribes: Array<() => void> = [];
	private destroyed = false;
	private contentContainer: HTMLElement | null = null;

	constructor(
		private readonly data: AppDataApi,
		private readonly router: Router,
		private readonly containerEl: HTMLElement,
		private readonly identity: Identity,
	) {
		this.code = identity.code;
		this.activeTab = getLastActiveTab(this.code);
	}

	async init(): Promise<void> {
		this.game = await this.data.loadGame(this.code);
		await this.data.joinGame(this.code);
	}

	destroy(): void {
		this.destroyed = true;
		destroyLayoutChrome();
		this.clearSubscriptions();
	}

	render(): void {
		if (this.destroyed) return;
		this.containerEl.replaceChildren();
		this.clearSubscriptions();

		if (!getHasAcceptedTerms(this.code)) {
			window.setTimeout(() => {
				void showAlert(this.game.rules, "Agree - Let's Play").then(() => {
					setHasAcceptedTerms(this.code, true);
					this.render();
				});
			});
		}

		const playerName = this.identity.isHost
			? null
			: resolvePlayerName(this.game, this.identity.playerCode);

		this.containerEl.append(
			titleBar({
				code: this.code,
				game: this.game,
				isHost: this.identity.isHost,
				playerName,
				data: this.data,
				router: this.router,
			}),
		);

		this.contentContainer = document.createElement("div");
		this.containerEl.append(this.contentContainer);
		this.refreshContent();

		this.containerEl.append(this.buildBottomMenu());
		this.containerEl.append(this.buildTaskModalHost());
	}

	private clearSubscriptions(): void {
		for (const unsubscribe of this.unsubscribes) unsubscribe();
		this.unsubscribes = [];
	}

	private refreshContent(): void {
		if (!this.contentContainer) return;
		this.clearSubscriptions();
		this.contentContainer.replaceChildren(this.buildContent());
	}

	private subscribeTask(key: string): void {
		const unsubscribe = this.data.subscribeTask(this.code, key, () => {
			if (!this.destroyed) this.refreshContent();
		});
		this.unsubscribes.push(unsubscribe);
	}

	private subscribeColumn(index: number): void {
		const unsubscribe = this.data.subscribeColumn(this.code, index, () => {
			if (!this.destroyed) this.refreshContent();
		});
		this.unsubscribes.push(unsubscribe);
	}

	private buildContent(): HTMLElement {
		const element = document.createElement("div");
		element.className = "view-content";
		element.setAttribute("data-mode", this.activeTab);

		this.game.columns.forEach((column, columnIndex) => {
			const colEl = document.createElement("div");
			colEl.className = "column";

			const colTitleEl = document.createElement("div");
			colTitleEl.className = "column-title";
			colTitleEl.textContent = `Column ${COLUMN_LETTERS[columnIndex] ?? columnIndex + 1}`;
			colEl.append(colTitleEl);

			column.tasks.forEach((task, taskIndex) => {
				const key = `${columnIndex}-${taskIndex}`;
				this.subscribeTask(key);
				const entry = this.data.getTask(this.code, key);
				const isCompleted = entry?.completed ?? false;
				const assignedCode = entry?.assignedTo ?? task.assignedTo ?? null;
				const assignedName = assignedCode
					? (resolvePlayerName(this.game, assignedCode) ?? assignedCode)
					: null;
				const renderer = getTaskTypeRenderer(task.type);

				colEl.append(
					this.activeTab === "list"
						? this.buildListTask(
								columnIndex,
								taskIndex,
								task,
								isCompleted,
								assignedName,
								renderer.icon,
							)
						: this.buildBoardTask(
								columnIndex,
								taskIndex,
								task,
								isCompleted,
								assignedName,
								renderer.icon,
							),
				);
			});

			this.subscribeColumn(columnIndex);
			colEl.append(this.buildColumnFooter(columnIndex, column));
			element.append(colEl);
		});

		return element;
	}

	private buildBoardTask(
		columnIndex: number,
		taskIndex: number,
		task: GameTask,
		isCompleted: boolean,
		assignedName: string | null,
		rendererIcon: string,
	): HTMLElement {
		const taskEl = document.createElement("div");
		taskEl.className = "task";
		taskEl.dataset.completed = String(isCompleted);
		taskEl.addEventListener("click", () =>
			this.showTaskModal(columnIndex, taskIndex, task),
		);

		const indexEl = document.createElement("span");
		indexEl.className = "task-index";
		if (isCompleted)
			indexEl.innerHTML = `<span class="task-icon">${icon(icons.check, 24)}</span>`;
		else if (rendererIcon)
			indexEl.innerHTML = `<span class="task-icon">${icon(rendererIcon, 24)}</span>`;
		else
			indexEl.textContent = `${COLUMN_LETTERS[columnIndex] ?? columnIndex + 1}${taskIndex + 1}`;
		taskEl.append(indexEl);

		if (assignedName) taskEl.append(this.buildAssignedBadge(assignedName));

		return taskEl;
	}

	private buildListTask(
		columnIndex: number,
		taskIndex: number,
		task: GameTask,
		isCompleted: boolean,
		assignedName: string | null,
		rendererIcon: string,
	): HTMLElement {
		const taskEl = document.createElement("div");
		taskEl.className = "task";
		taskEl.dataset.completed = String(isCompleted);
		taskEl.addEventListener("click", () =>
			this.showTaskModal(columnIndex, taskIndex, task),
		);

		const checkmark = document.createElement("span");
		checkmark.className = "checkmark";
		if (isCompleted) checkmark.innerHTML = icon(icons.check, 14);
		taskEl.append(checkmark);

		const iconEl = document.createElement("span");
		iconEl.className = "task-icon";
		iconEl.innerHTML = icon(rendererIcon, 20);
		taskEl.append(iconEl);

		const message = document.createElement("span");
		message.className = "task-message";
		message.textContent = task.message;
		taskEl.append(message);

		if (assignedName) {
			const badge = this.buildAssignedBadge(assignedName);
			badge.classList.add("task-assigned-badge--inline");
			taskEl.append(badge);
		}

		return taskEl;
	}

	private buildAssignedBadge(assignedName: string): HTMLElement {
		const badge = document.createElement("span");
		badge.className = "task-assigned-badge";
		badge.textContent = assignedName.slice(0, 2).toUpperCase();
		badge.title = `Assigned: ${assignedName}`;
		return badge;
	}

	private buildColumnFooter(
		columnIndex: number,
		column: GameColumn,
	): HTMLElement {
		const columnEntry = this.data.getColumn(this.code, columnIndex);
		const revealed = columnEntry?.revealed ?? false;
		const completedCount = column.tasks.filter(
			(_task, taskIndex) =>
				this.data.getTask(this.code, `${columnIndex}-${taskIndex}`)?.completed,
		).length;

		const footer = document.createElement("div");
		footer.className = "column-footer";

		const progress = document.createElement("div");
		progress.className = "column-progress";
		progress.textContent = `${completedCount}/${column.tasks.length} complete`;
		footer.append(progress);

		if (revealed) {
			const prizeBtn = document.createElement("button");
			prizeBtn.className = "prize";
			prizeBtn.innerHTML = `${icon(icons.gift, 18)} See Prize`;
			prizeBtn.addEventListener("click", () => void showAlert(column.prize));
			footer.append(prizeBtn);
		} else if (this.identity.isHost) {
			const revealBtn = document.createElement("button");
			revealBtn.className = "prize";
			revealBtn.innerHTML = `${icon(icons.gift, 18)} Reveal Prize`;
			revealBtn.addEventListener("click", () => {
				void showConfirm("Reveal this column's prize to everyone?").then(
					(confirmed) => {
						if (confirmed) void this.data.revealColumn(this.code, columnIndex);
					},
				);
			});
			footer.append(revealBtn);
		} else {
			const locked = document.createElement("button");
			locked.className = "prize secondary";
			locked.innerHTML = `${icon(icons.lock, 18)} Prize Locked`;
			locked.disabled = true;
			footer.append(locked);
		}

		return footer;
	}

	private buildBottomMenu(): HTMLElement {
		const element = document.createElement("nav");
		element.className = "bottom-menu";
		element.innerHTML = `
			<button type="button" class="menu-tab" data-tab="board" aria-label="Board View">${icon(icons.board, 24)}<span class="menu-label">Board</span></button>
			<button type="button" class="menu-tab" data-tab="list" aria-label="List View">${icon(icons.list, 24)}<span class="menu-label">List</span></button>
		`;
		element
			.querySelector(`[data-tab="${this.activeTab}"]`)
			?.classList.add("menu-tab--active");
		element.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const tab = target.closest<HTMLElement>("[data-tab]")?.dataset.tab;
			if (tab !== "board" && tab !== "list") return;
			this.activeTab = tab;
			setLastActiveTab(this.code, tab);
			this.render();
		});
		return element;
	}

	private buildTaskModalHost(): HTMLElement {
		const el = document.createElement("div");
		el.id = "task-modal";
		el.className = "modal task-modal";
		el.innerHTML = `<div class="modal-shell top"><div class="modal-content"></div></div>`;
		return el;
	}

	private buildAssignmentControl(
		key: string,
		task: GameTask,
		entry: TaskEntry | undefined,
	): HTMLElement {
		const wrap = document.createElement("div");
		wrap.className = "assignment-control";
		const label = document.createElement("div");
		label.className = "task-field-label";
		label.textContent = "Assigned to:";
		const select = document.createElement("select");
		const anyOption = document.createElement("option");
		anyOption.value = "";
		anyOption.textContent = "Anyone";
		select.append(anyOption);
		for (const [playerCode, name] of Object.entries(this.game.players)) {
			const option = document.createElement("option");
			option.value = playerCode;
			option.textContent = name;
			select.append(option);
		}
		select.value = entry?.assignedTo ?? task.assignedTo ?? "";
		select.addEventListener("change", () => {
			void this.data.setTaskAssignment(this.code, key, select.value || null);
		});
		wrap.append(label, select);
		return wrap;
	}

	private showTaskModal(
		columnIndex: number,
		taskIndex: number,
		task: GameTask,
	): void {
		const key = `${columnIndex}-${taskIndex}`;
		const modal = byId<HTMLElement>("task-modal");
		const modalShell = modal.querySelector(".modal-shell") as HTMLElement;
		const modalContent = modal.querySelector(".modal-content") as HTMLElement;

		const renderInto = (): void => {
			modalContent.replaceChildren();
			const entry = this.data.getTask(this.code, key);
			const renderer = getTaskTypeRenderer(task.type);
			const ctx: TaskRenderContext = {
				entry,
				isHost: this.identity.isHost,
				game: this.game,
				selfPlayerCode: this.identity.isHost ? null : this.identity.playerCode,
			};
			const actions: TaskActions = {
				complete: (completedBy) => {
					void this.data
						.setTaskCompleted(this.code, key, true, completedBy || null)
						.then(() => this.closeTaskModal());
				},
				reopen: () => {
					void this.data
						.setTaskCompleted(this.code, key, false, entry?.completedBy ?? null)
						.then(() => this.closeTaskModal());
				},
			};

			if (this.identity.isHost)
				modalContent.append(this.buildAssignmentControl(key, task, entry));
			modalContent.append(renderer.renderModalBody(task, ctx, actions));

			const closeBtn = document.createElement("button");
			closeBtn.className = "secondary task-modal-close";
			closeBtn.textContent = "Close";
			closeBtn.addEventListener("click", () => this.closeTaskModal());
			modalContent.append(closeBtn);
		};

		renderInto();

		modal.classList.add("show");
		modalShell.classList.remove("top", "bottom", "show");
		modalShell.classList.add("top");
		requestAnimationFrame(() => modalShell.classList.add("show"));
	}

	private closeTaskModal(): void {
		const modal = byId<HTMLElement>("task-modal");
		const modalShell = modal.querySelector(".modal-shell") as HTMLElement;
		const modalContent = modal.querySelector(".modal-content") as HTMLElement;
		modalShell.classList.remove("show");
		modalShell.addEventListener(
			"transitionend",
			() => {
				modal.classList.remove("show");
				modalContent.replaceChildren();
			},
			{ once: true },
		);
	}
}
