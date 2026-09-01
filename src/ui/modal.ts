interface ModalHandle {
	el: HTMLElement;
	shellEl: HTMLElement;
	contentEl: HTMLElement;
}

function buildShell(): ModalHandle {
	const el = document.createElement("div");
	el.className = "modal alert-modal";
	el.innerHTML = `<div class="modal-shell top"><div class="modal-content"></div></div>`;
	const shellEl = el.querySelector(".modal-shell") as HTMLElement;
	const contentEl = el.querySelector(".modal-content") as HTMLElement;
	document.body.append(el);
	return { el, shellEl, contentEl };
}

function open(modal: ModalHandle): void {
	modal.el.classList.add("show");
	requestAnimationFrame(() => modal.shellEl.classList.add("show"));
}

function close(modal: ModalHandle, done: () => void): void {
	modal.shellEl.classList.remove("show");
	modal.shellEl.addEventListener(
		"transitionend",
		() => {
			modal.el.remove();
			done();
		},
		{ once: true },
	);
}

/** A single-button informational modal (rules text, prize reveal, penalty draw). */
export function showAlert(
	message: string,
	buttonLabel = "Close",
): Promise<void> {
	return new Promise((resolve) => {
		const modal = buildShell();
		const content = document.createElement("div");
		content.className = "alert-modal-content";
		content.innerHTML = `<div>${message}</div>`;
		const actions = document.createElement("div");
		actions.className = "modal-actions";
		const button = document.createElement("button");
		button.textContent = buttonLabel;
		button.addEventListener("click", () => close(modal, resolve));
		actions.append(button);
		content.append(actions);
		modal.contentEl.append(content);
		open(modal);
	});
}

export function showConfirm(
	message: string,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = buildShell();
		const content = document.createElement("div");
		content.className = "alert-modal-content";
		content.innerHTML = `<div>${message}</div>`;
		const actions = document.createElement("div");
		actions.className = "modal-actions";
		const confirmBtn = document.createElement("button");
		confirmBtn.textContent = confirmLabel;
		confirmBtn.addEventListener("click", () =>
			close(modal, () => resolve(true)),
		);
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "secondary";
		cancelBtn.textContent = cancelLabel;
		cancelBtn.addEventListener("click", () =>
			close(modal, () => resolve(false)),
		);
		actions.append(confirmBtn, cancelBtn);
		content.append(actions);
		modal.contentEl.append(content);
		open(modal);
	});
}

/**
 * A password-gated modal (used for the HOST login) that shows an inline
 * "Incorrect password" error and lets the user retry without limit --
 * this is a party, not a security boundary. Resolves true on success,
 * false if cancelled.
 */
export function showPasswordPrompt({
	title,
	submitLabel = "Submit",
	validate,
}: {
	title: string;
	submitLabel?: string;
	validate(password: string): boolean;
}): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = buildShell();
		const content = document.createElement("div");
		content.className = "alert-modal-content password-prompt";
		content.innerHTML = `
			<div class="task-field-label">${title}</div>
			<input type="password" class="password-input" autocomplete="off" inputmode="text" />
			<div class="home-form__error" hidden></div>
		`;
		const input = content.querySelector("input") as HTMLInputElement;
		const error = content.querySelector(".home-form__error") as HTMLElement;
		const actions = document.createElement("div");
		actions.className = "modal-actions";
		const submitBtn = document.createElement("button");
		submitBtn.textContent = submitLabel;
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "secondary";
		cancelBtn.textContent = "Cancel";

		const submit = (): void => {
			if (validate(input.value)) {
				close(modal, () => resolve(true));
				return;
			}
			error.textContent = "Incorrect password";
			error.hidden = false;
			input.classList.add("shake");
			input.value = "";
			input.focus();
			window.setTimeout(() => input.classList.remove("shake"), 420);
		};

		submitBtn.addEventListener("click", submit);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") submit();
		});
		cancelBtn.addEventListener("click", () =>
			close(modal, () => resolve(false)),
		);

		actions.append(submitBtn, cancelBtn);
		content.append(actions);
		modal.contentEl.append(content);
		open(modal);
		window.setTimeout(() => input.focus(), 50);
	});
}
