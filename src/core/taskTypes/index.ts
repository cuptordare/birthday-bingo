import { icons } from "../../ui/icons";
import type { TaskTypeRenderer } from "./registry-types";
import { simpleTaskRenderer } from "./simpleTask";
import { triviaRenderer } from "./trivia";

const registry = new Map<string, TaskTypeRenderer>();

function register(renderer: TaskTypeRenderer): void {
	registry.set(renderer.type, renderer);
}

register(simpleTaskRenderer("Fun"));
register(simpleTaskRenderer("Drink"));
register(simpleTaskRenderer("Flirty"));
register(simpleTaskRenderer("ScavengerHunt"));
register(triviaRenderer);

const fallbackRenderer: TaskTypeRenderer = {
	type: "__fallback__",
	icon: icons.gift,
	renderModalBody(task, _ctx, actions) {
		const el = document.createElement("div");
		el.className = "task-modal-content";
		const message = document.createElement("div");
		message.className = "task-message";
		message.textContent = task.message;
		el.append(message);
		const actionsEl = document.createElement("div");
		actionsEl.className = "task-modal-actions";
		const completeBtn = document.createElement("button");
		completeBtn.textContent = "Complete Task";
		completeBtn.addEventListener("click", () => actions.complete(""));
		actionsEl.append(completeBtn);
		el.append(actionsEl);
		return el;
	},
};

/** Unknown task types degrade to a plain message + Complete button instead of crashing. */
export function getTaskTypeRenderer(type: string): TaskTypeRenderer {
	return registry.get(type) ?? fallbackRenderer;
}
