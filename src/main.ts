import { applyTheme, getStoredThemeId } from "./core/config";
import { createAppData } from "./core/data";
import { byId } from "./core/helpers";
import type { RouteName } from "./core/types";
import { Router, type View } from "./ui/router";
import { createBoardView } from "./views/board";
import { createHomeView } from "./views/home";

applyTheme(getStoredThemeId());

const data = createAppData();
const appEl = byId("app");
const routes = {} as Record<RouteName, View>;
const router = new Router(appEl, routes);

routes.home = createHomeView(data, router);
routes.board = createBoardView(data, router);

router.init();

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("./sw.js");
	});
}
