import { icons } from "../../ui/icons";
import type { TaskTypeRenderer } from "./registry-types";

/**
 * Always assigned to exactly one player (enforced at build time in
 * encryptContent.mjs). Unlike every other task type, the task's *content* is
 * gated, not just the ability to act on it: `ctx.canAct` already reduces to
 * "host or the assigned player" once a task is always assigned, so it doubles
 * as the view gate here -- anyone else gets a placeholder that reveals
 * neither the current agenda text nor who it's assigned to. The player must
 * pull it off without other players noticing; getting spotted advances to
 * the next agenda in the list (asked as a "Were you noticed?" select, left
 * unset by default, mirroring Trivia's "reveal the quiz before Mark Complete
 * unlocks" gating, so a stray tap can't silently burn a try or complete the
 * mission), and once every agenda has been failed, only the host can still
 * mark it complete (out of mercy) or reopen it.
 */
export const secretAgendaRenderer: TaskTypeRenderer = {
	type: "SecretAgenda",
	icon: icons.keyhole,
	supportsAssignment: true,
	renderModalBody(task, ctx, actions) {
		const el = document.createElement("div");
		el.className = "task-modal-content";

		const message = document.createElement("div");
		message.className = "task-message";
		message.textContent = task.message;
		el.append(message);

		if (!ctx.canAct) {
			const note = document.createElement("div");
			note.className = "task-locked-note";
			note.textContent = ctx.entry?.completed
				? "This secret mission has been completed."
				: "This is a private secret mission. Only the assigned player and the host can see it.";
			el.append(note);
			return el;
		}

		const agendas = task.agendas ?? [];
		const index = ctx.entry?.agendaIndex ?? 0;
		const exhausted = agendas.length > 0 && ctx.entry?.agendaExhausted === true;
		const completed = ctx.entry?.completed ?? false;
		// Once exhausted, the failed-everything "mercy" decision belongs to the
		// host alone -- the assigned player has used up their chances.
		const mayAct = exhausted ? ctx.isHost : true;

		// The current (or last-attempted, if completed) agenda stays visible
		// even after completion -- there's no "current" agenda once every one
		// has been failed, so exhausted skips this.
		if (!exhausted && agendas.length > 0) {
			const progress = document.createElement("div");
			progress.className = "secret-agenda-progress";
			progress.textContent = `Secret agenda -- try ${index + 1} of ${agendas.length}`;
			el.append(progress);

			const current = document.createElement("div");
			current.className = "secret-agenda-current";
			current.textContent = agendas[index] ?? "";
			el.append(current);
		}

		const actionsEl = document.createElement("div");
		actionsEl.className = "task-modal-actions";

		if (completed) {
			if (mayAct) {
				const reopenBtn = document.createElement("button");
				reopenBtn.className = "secondary";
				reopenBtn.textContent = "Not Completed";
				reopenBtn.addEventListener("click", () => actions.reopen());
				actionsEl.append(reopenBtn);
			} else {
				const note = document.createElement("div");
				note.className = "task-locked-note";
				note.textContent = "Only the host can reopen this now.";
				el.append(note);
			}
		} else if (exhausted) {
			const note = document.createElement("div");
			note.className = "task-locked-note";
			note.textContent = ctx.isHost
				? "Every secret agenda has been failed. You can still mark this complete out of mercy."
				: "You've been noticed on every secret agenda for this task. Only the host can mark it complete now.";
			el.append(note);
			if (mayAct) {
				const completeBtn = document.createElement("button");
				completeBtn.textContent = "Mark Complete (Mercy)";
				completeBtn.addEventListener("click", () => actions.complete());
				actionsEl.append(completeBtn);
			}
		} else if (agendas.length > 0) {
			const question = document.createElement("div");
			question.className = "task-field-label";
			question.textContent = "Were you noticed?";
			el.append(question);

			const select = document.createElement("select");
			const blankOption = document.createElement("option");
			blankOption.value = "";
			blankOption.textContent = "Select an answer...";
			blankOption.disabled = true;
			blankOption.hidden = true;
			blankOption.selected = true;
			const noOption = document.createElement("option");
			noOption.value = "no";
			noOption.textContent = "No";
			const yesOption = document.createElement("option");
			yesOption.value = "yes";
			yesOption.textContent = "Yes";
			select.append(blankOption, noOption, yesOption);
			el.append(select);

			const confirmBtn = document.createElement("button");
			confirmBtn.disabled = true;
			confirmBtn.textContent = "Choose an answer above";

			select.addEventListener("change", () => {
				if (select.value === "no") {
					confirmBtn.disabled = false;
					confirmBtn.textContent = "Mark Complete";
					confirmBtn.onclick = () => actions.complete();
				} else if (select.value === "yes") {
					confirmBtn.disabled = false;
					confirmBtn.textContent = "Next Agenda";
					confirmBtn.onclick = () => actions.fail();
				} else {
					confirmBtn.disabled = true;
					confirmBtn.textContent = "Choose an answer above";
				}
			});

			actionsEl.append(confirmBtn);
		} else {
			// Malformed content fallback: authored with zero agendas.
			const completeBtn = document.createElement("button");
			completeBtn.textContent = "Mark Complete";
			completeBtn.addEventListener("click", () => actions.complete());
			actionsEl.append(completeBtn);
		}

		if (actionsEl.childElementCount > 0) el.append(actionsEl);

		if (ctx.isHost && agendas.length > 0 && (completed || exhausted || index > 0)) {
			const resetWrap = document.createElement("div");
			resetWrap.className = "secret-agenda-reset";
			const resetBtn = document.createElement("button");
			resetBtn.type = "button";
			resetBtn.className = "secondary";
			resetBtn.textContent = "Reset Secret Agenda Progress";
			resetBtn.addEventListener("click", () => actions.reset());
			resetWrap.append(resetBtn);
			el.append(resetWrap);
		}

		return el;
	},
};
