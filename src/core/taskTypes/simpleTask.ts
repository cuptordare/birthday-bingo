import { icons } from "../../ui/icons";
import type { TaskTypeRenderer } from "./registry-types";

const iconByType: Record<string, string> = {
	Fun: icons.fun,
	Drink: icons.drink,
	Flirty: icons.flirty,
	ScavengerHunt: icons.scavengerHunt,
};

/** Covers Fun/Drink/Flirty/ScavengerHunt -- message + a "completed by" chooser + Complete/Not Completed. */
export function simpleTaskRenderer(type: string): TaskTypeRenderer {
	return {
		type,
		icon: iconByType[type] ?? "",
		renderModalBody(task, ctx, actions) {
			const el = document.createElement("div");
			el.className = "task-modal-content";

			const message = document.createElement("div");
			message.className = "task-message";
			message.textContent = task.message;
			el.append(message);

			const roster = Object.entries(ctx.game.players);
			const chooserWrap = document.createElement("div");
			chooserWrap.className = "completed-by-chooser";
			const label = document.createElement("div");
			label.className = "task-field-label";
			label.textContent = "Completed by:";
			const select = document.createElement("select");
			for (const [code, name] of roster) {
				const option = document.createElement("option");
				option.value = code;
				option.textContent = name;
				select.append(option);
			}
			const defaultCode =
				ctx.entry?.completedBy ?? ctx.selfPlayerCode ?? roster[0]?.[0] ?? "";
			select.value = defaultCode;
			chooserWrap.append(label, select);
			el.append(chooserWrap);

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
				completeBtn.addEventListener("click", () =>
					actions.complete(select.value),
				);
				actionsEl.append(completeBtn);
			}
			el.append(actionsEl);
			return el;
		},
	};
}
