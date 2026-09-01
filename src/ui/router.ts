import type { RouteName } from "../core/types";

export interface View {
	render(): string | HTMLElement;
	onMount?(): void | Promise<void>;
	onDestroy?(): void;
}

export class Router {
	#currentView: View | null = null;
	// null (not "home") until the first render completes, so the render()
	// dedupe guard below can't accidentally swallow the very first navigation.
	#currentRoute: RouteName | null = null;

	constructor(
		private readonly appEl: HTMLElement,
		private readonly routes: Record<RouteName, View>,
	) {}

	init(): void {
		window.addEventListener("popstate", () => {
			void this.render(this.routeFromHash());
		});

		document.body.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const link = target.closest<HTMLElement>("[data-navigate-to]");
			const route = link?.dataset.navigateTo as RouteName | undefined;
			if (!route) return;
			event.preventDefault();
			void this.navigateTo(route);
		});

		void this.render(this.routeFromHash());
	}

	getCurrentRoute(): RouteName {
		return this.#currentRoute ?? "home";
	}

	async navigateTo(route: RouteName): Promise<void> {
		window.location.hash = route;
		await this.render(route);
	}

	private routeFromHash(): RouteName {
		const route = window.location.hash.replace("#", "") as RouteName;
		return route in this.routes ? route : "home";
	}

	private async render(route: RouteName): Promise<void> {
		// Assigning `location.hash` (in navigateTo, below) also fires a
		// `popstate` event in Chromium, which would otherwise trigger a
		// second, redundant render of the route navigateTo() already just
		// rendered directly -- harmless for a stateless view, but a real bug
		// for any view with a one-time render side effect (e.g. board.ts's
		// first-run rules modal, which would otherwise show twice).
		if (route === this.#currentRoute) return;
		const view = this.routes[route];
		if (!view) return;
		this.#currentView?.onDestroy?.();
		this.#currentRoute = route;
		document.body.dataset.route = route;
		this.appEl.classList.add("fade-out");
		await new Promise((resolve) => setTimeout(resolve, 120));
		this.appEl.replaceChildren();
		const content = view.render();
		if (typeof content === "string") this.appEl.innerHTML = content;
		else this.appEl.append(content);
		this.#currentView = view;
		this.appEl.classList.remove("fade-out");
		this.appEl.classList.add("fade-in");
		window.setTimeout(() => this.appEl.classList.remove("fade-in"), 220);
		await view.onMount?.();
	}
}
