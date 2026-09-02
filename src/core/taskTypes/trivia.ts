import { icons } from "../../ui/icons";
import type { TriviaQuestion } from "../types";
import type { TaskTypeRenderer } from "./registry-types";

function buildQuiz(
	questions: TriviaQuestion[],
	onLastAnswerRevealed: () => void,
): HTMLElement {
	let currentIndex = 0;
	const el = document.createElement("div");
	el.className = "trivia-quiz";
	el.innerHTML = `
		<button type="button" class="trivia-btn trivia-btn--start">Start Trivia</button>
		<div class="trivia-question" hidden></div>
		<button type="button" class="trivia-btn trivia-btn--secondary" hidden>Show Answer</button>
		<div class="trivia-answer" hidden></div>
		<button type="button" class="trivia-btn trivia-btn--secondary" hidden>Next Question</button>
	`;
	const [startBtn, showAnswerBtn, nextBtn] = el.querySelectorAll("button");
	const questionDiv = el.querySelector(".trivia-question") as HTMLElement;
	const answerDiv = el.querySelector(".trivia-answer") as HTMLElement;

	const loadQuestion = (): void => {
		const question = questions[currentIndex];
		if (!question) return;
		questionDiv.textContent = `${currentIndex + 1}. ${question.question}`;
		questionDiv.hidden = false;
		answerDiv.hidden = true;
		answerDiv.textContent = question.answer;
		if (showAnswerBtn) {
			showAnswerBtn.textContent = "Show Answer";
			showAnswerBtn.hidden = false;
		}
		if (nextBtn) nextBtn.hidden = true;
	};

	startBtn?.addEventListener("click", () => {
		startBtn.hidden = true;
		loadQuestion();
	});

	showAnswerBtn?.addEventListener("click", () => {
		if (answerDiv.hidden) {
			answerDiv.hidden = false;
			showAnswerBtn.textContent = "Hide Answer";
			if (currentIndex < questions.length - 1 && nextBtn) {
				nextBtn.hidden = false;
			} else {
				onLastAnswerRevealed();
			}
		} else {
			answerDiv.hidden = true;
			showAnswerBtn.textContent = "Show Answer";
			if (nextBtn) nextBtn.hidden = true;
		}
	});

	nextBtn?.addEventListener("click", () => {
		if (currentIndex < questions.length - 1) {
			currentIndex += 1;
			loadQuestion();
		}
	});

	return el;
}

/**
 * Host-run: only the host's device ever renders questions/answers -- the
 * host reads them aloud and keeps score in person. Non-host devices see
 * only the intro message and a waiting placeholder. Declaring a winner and
 * picking a penalty happen out loud, not in the app: the host just marks
 * the task complete (or not) when the challenge is done. See plan §5.
 */
export const triviaRenderer: TaskTypeRenderer = {
	type: "Trivia",
	icon: icons.trivia,
	renderModalBody(task, ctx, actions) {
		const el = document.createElement("div");
		el.className = "task-modal-content";

		const message = document.createElement("div");
		message.className = "task-message";
		message.textContent = task.message;
		el.append(message);

		if (!ctx.isHost) {
			const waiting = document.createElement("div");
			waiting.className = "trivia-waiting";
			waiting.textContent = ctx.entry?.completed
				? "This challenge has been completed."
				: "Waiting for the host to run this challenge…";
			el.append(waiting);
			return el;
		}

		const questions = task.trivia ?? [];
		let enableCompleteBtn = (): void => {};
		el.append(buildQuiz(questions, () => enableCompleteBtn()));

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
			completeBtn.textContent = "Mark Complete";
			completeBtn.disabled = questions.length > 0;
			enableCompleteBtn = () => {
				completeBtn.disabled = false;
			};
			completeBtn.addEventListener("click", () => actions.complete());
			actionsEl.append(completeBtn);
		}
		el.append(actionsEl);
		return el;
	},
};
