import { icons } from "../../ui/icons";
import type { TaskTypeRenderer } from "./registry-types";

const iconByType: Record<string, string> = {
	Fun: icons.fun,
	Drink: icons.drink,
	Flirty: icons.flirty,
	ScavengerHunt: icons.scavengerHunt,
};

/** Only these simple types make sense to hand to one specific player; ScavengerHunt is open-ended by nature. */
const assignableTypes = new Set(["Fun", "Drink", "Flirty"]);

/** Covers Fun/Drink/Flirty/ScavengerHunt -- just the message + Complete/Not Completed. */
export function simpleTaskRenderer(type: string): TaskTypeRenderer {
	return {
		type,
		icon: iconByType[type] ?? "",
		supportsAssignment: assignableTypes.has(type),
		renderModalBody(task, ctx, actions) {
			const el = document.createElement("div");
			el.className = "task-modal-content";

			const message = document.createElement("div");
			message.className = "task-message";
			message.textContent = task.message;
			el.append(message);

			if (!ctx.canAct) {
				const locked = document.createElement("div");
				locked.className = "task-locked-note";
				locked.textContent = `Only ${ctx.assignedToName ?? "the assigned player"} can mark this ${ctx.entry?.completed ? "not completed" : "complete"}.`;
				el.append(locked);
				return el;
			}

			const actionsEl = document.createElement("div");
			actionsEl.className = "task-modal-actions";
			if (ctx.entry?.completed) {
				const reopenBtn = document.createElement("button");
				reopenBtn.className = "secondary";
				reopenBtn.textContent = "Not Completed";
				reopenBtn.addEventListener("click", () => actions.reopen());
				actionsEl.append(reopenBtn);
			} else {
				const completeBtn = document.createElement("button");
				completeBtn.textContent = "Complete Task";
				completeBtn.addEventListener("click", () => actions.complete());
				actionsEl.append(completeBtn);
			}
			el.append(actionsEl);
			return el;
		},
	};
}
