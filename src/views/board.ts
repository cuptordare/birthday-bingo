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
	TaskTypeRenderer,
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
				const renderer = getTaskTypeRenderer(task.type);
				const assignedCode = this.effectiveAssignedCode(task, entry, renderer);
				const badgeCode = this.canSeeAssignedBadge(task, assignedCode)
					? assignedCode
					: null;

				colEl.append(
					this.activeTab === "list"
						? this.buildListTask(
								columnIndex,
								taskIndex,
								task,
								isCompleted,
								badgeCode,
								renderer.icon,
							)
						: this.buildBoardTask(
								columnIndex,
								taskIndex,
								task,
								isCompleted,
								badgeCode,
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
		assignedCode: string | null,
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

		if (assignedCode) taskEl.append(this.buildAssignedBadge(assignedCode));

		return taskEl;
	}

	private buildListTask(
		columnIndex: number,
		taskIndex: number,
		task: GameTask,
		isCompleted: boolean,
		assignedCode: string | null,
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

		if (assignedCode) {
			const badge = this.buildAssignedBadge(assignedCode);
			badge.classList.add("task-assigned-badge--inline");
			taskEl.append(badge);
		}

		return taskEl;
	}

	private buildAssignedBadge(assignedCode: string): HTMLElement {
		const badge = document.createElement("span");
		badge.className = "task-assigned-badge";
		badge.textContent = assignedCode.toUpperCase();
		badge.title = `Assigned: ${resolvePlayerName(this.game, assignedCode) ?? assignedCode}`;
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
		const goalMet = completedCount >= column.tasks.length;

		const footer = document.createElement("div");
		footer.className = "column-footer";
		const progressLabel = `${completedCount} of ${column.tasks.length}`;

		if (revealed) {
			const prizeBtn = document.createElement("button");
			prizeBtn.className = "prize";
			prizeBtn.innerHTML = `${icon(icons.gift, 18)} ${progressLabel}`;
			prizeBtn.addEventListener("click", () => void showAlert(column.prize));
			footer.append(prizeBtn);

			if (this.identity.isHost) {
				const hideBtn = document.createElement("button");
				hideBtn.className = "secondary prize-toggle";
				hideBtn.textContent = "Hide Prize";
				hideBtn.addEventListener("click", () => {
					void showConfirm("Hide this column's prize again?").then(
						(confirmed) => {
							if (confirmed)
								void this.data.setColumnRevealed(this.code, columnIndex, false);
						},
					);
				});
				footer.append(hideBtn);
			}
		} else if (this.identity.isHost) {
			const revealBtn = document.createElement("button");
			revealBtn.className = goalMet ? "prize" : "prize secondary";
			revealBtn.innerHTML = `${icon(goalMet ? icons.gift : icons.lock, 18)} ${progressLabel}`;
			// Never actually disabled -- the host can always override and
			// reveal early. The lock styling is just a visual nudge that the
			// column's own goal hasn't been hit yet.
			if (!goalMet)
				revealBtn.title = `Only ${completedCount} of ${column.tasks.length} tasks are done. You can still reveal early.`;
			revealBtn.addEventListener("click", () => {
				const prompt = goalMet
					? "Reveal this column's prize to everyone?"
					: `Only ${completedCount} of ${column.tasks.length} tasks are done. Reveal the prize early anyway?`;
				void showConfirm(prompt).then((confirmed) => {
					if (confirmed)
						void this.data.setColumnRevealed(this.code, columnIndex, true);
				});
			});
			footer.append(revealBtn);

			const peekBtn = document.createElement("button");
			peekBtn.className = "secondary prize-toggle";
			peekBtn.textContent = "Peek";
			peekBtn.addEventListener("click", () => void showAlert(column.prize));
			footer.append(peekBtn);
		} else {
			const locked = document.createElement("button");
			locked.className = "prize secondary";
			locked.innerHTML = `${icon(icons.lock, 18)} ${progressLabel}`;
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

	/** Host override wins; falls back to content's default; null for non-assignable types (e.g. Trivia). */
	private effectiveAssignedCode(
		task: GameTask,
		entry: TaskEntry | undefined,
		renderer: TaskTypeRenderer,
	): string | null {
		if (renderer.supportsAssignment !== true) return null;
		return entry?.assignedTo ?? task.assignedTo ?? null;
	}

	/**
	 * SecretAgenda hides *who* it's assigned to from everyone but the host
	 * and that player -- showing the badge to the whole table would let them
	 * watch the assigned player and defeat the "without anyone noticing"
	 * mechanic. Every other assignable type shows it to all, same as always.
	 */
	private canSeeAssignedBadge(
		task: GameTask,
		assignedCode: string | null,
	): boolean {
		if (!assignedCode) return false;
		if (task.type !== "SecretAgenda") return true;
		return (
			this.identity.isHost ||
			assignedCode.toUpperCase() === this.identity.playerCode.toUpperCase()
		);
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
			const assignedCode = this.effectiveAssignedCode(task, entry, renderer);
			const assignedToName = assignedCode
				? (resolvePlayerName(this.game, assignedCode) ?? assignedCode)
				: null;
			const canAct =
				this.identity.isHost ||
				!assignedCode ||
				assignedCode.toUpperCase() === this.identity.playerCode.toUpperCase();
			const ctx: TaskRenderContext = {
				entry,
				isHost: this.identity.isHost,
				game: this.game,
				selfPlayerCode: this.identity.isHost ? null : this.identity.playerCode,
				assignedToName,
				canAct,
			};
			const actions: TaskActions = {
				complete: () => {
					void this.data
						.setTaskCompleted(this.code, key, true)
						.then(() => this.closeTaskModal());
				},
				reopen: () => {
					void this.data
						.setTaskCompleted(this.code, key, false)
						.then(() => this.closeTaskModal());
				},
				fail: () => {
					// Unlike complete/reopen, this doesn't end the task -- it
					// just moves to the next agenda, so keep the modal open
					// and re-render it in place instead of closing.
					void this.data
						.failTaskAgenda(this.code, key, task.agendas?.length ?? 0)
						.then(() => renderInto());
				},
				reset: () => {
					void this.data.resetTaskAgenda(this.code, key).then(() => renderInto());
				},
			};

			if (this.identity.isHost && renderer.supportsAssignment === true)
				modalContent.append(this.buildAssignmentControl(key, task, entry));
			const body = renderer.renderModalBody(task, ctx, actions);
			modalContent.append(body);

			const closeBtn = document.createElement("button");
			closeBtn.className = "secondary";
			closeBtn.textContent = "Close";
			closeBtn.addEventListener("click", () => this.closeTaskModal());

			// Put Close alongside the renderer's primary action(s) so they sit
			// side by side instead of Close stacking full-width underneath.
			let actionsEl = body.querySelector<HTMLElement>(".task-modal-actions");
			if (!actionsEl) {
				actionsEl = document.createElement("div");
				actionsEl.className = "task-modal-actions";
				body.append(actionsEl);
			}
			actionsEl.append(closeBtn);
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
