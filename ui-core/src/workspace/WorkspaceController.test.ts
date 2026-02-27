import { WorkspaceController, normalizePaneRatios } from "./WorkspaceController.js";
import { PRICE_PANE_ID } from "./constants.js";

function testWorkspaceController() {
    console.log("Running WorkspaceController tests...");
    const controller = new WorkspaceController({ theme: "dark" });

    // Test initial state
    const initialState = controller.getState();
    if (initialState.theme !== "dark") throw new Error("Initial theme should be dark");
    if (initialState.paneLayout.order[0] !== PRICE_PANE_ID) throw new Error("Primary pane should be price");

    // Test theme toggle
    let themeChanged = false;
    controller.subscribe((state) => {
        if (state.theme === "light") themeChanged = true;
    });

    controller.setTheme("light");
    if (!themeChanged) throw new Error("Theme change notification failed");
    if (controller.getState().theme !== "light") throw new Error("Theme state update failed");

    // Test tool change
    controller.setActiveTool("rectangle");
    if (controller.getState().activeTool !== "rectangle") throw new Error("Tool state update failed");

    // Test normalizePaneRatios
    const normalized = normalizePaneRatios({ "p1": 0.5, "p2": -0.1 }, ["p1", "p2"]);
    if (Math.abs(normalized["p1"] - 1.0) > 0.001) throw new Error("Should normalize to 1");
    if (Math.abs(normalized["p2"] - 0.0) > 0.001) throw new Error("Should handle negative/zero properly");

    const sumNorm = normalizePaneRatios({ "p1": 10, "p2": 30 }, ["p1", "p2"]);
    if (Math.abs(sumNorm["p1"] - 0.25) > 0.001) throw new Error("Should be 0.25");
    if (Math.abs(sumNorm["p2"] - 0.75) > 0.001) throw new Error("Should be 0.75");

    const fallbackNorm = normalizePaneRatios({ "p1": 0, "p2": 0 }, ["p1", "p2"]);
    if (Math.abs(fallbackNorm["p1"] - 0.5) > 0.001) throw new Error("Should assign equal ratio");

    // Test pane lifecycle
    controller.registerPane({ id: "ind1", kind: "indicator", title: "RSI" });
    let state = controller.getState();
    if (state.paneLayout.order.length !== 2) throw new Error("Should have 2 panes");
    if (!state.paneLayout.panes["ind1"]) throw new Error("ind1 should be registered");

    controller.setPaneVisible("ind1", false);
    state = controller.getState();
    if (state.paneLayout.visibility["ind1"] !== false) throw new Error("ind1 visibility should be false");
    if (state.paneLayout.ratios[PRICE_PANE_ID] !== 1.0) throw new Error("Price pane should take full height when ind1 is hidden");

    controller.setPaneVisible("ind1", true);
    controller.setPaneRatio("ind1", 0.5);
    state = controller.getState();
    if (state.paneLayout.ratios["ind1"] !== 0.5) throw new Error("ind1 ratio should be 0.5");
    if (state.paneLayout.ratios[PRICE_PANE_ID] !== 0.5) throw new Error("Price pane ratio should be 0.5");

    controller.unregisterPane("ind1");
    state = controller.getState();
    if (state.paneLayout.order.length !== 1) throw new Error("Should revert to 1 pane");

    console.log("WorkspaceController tests passed!");
}

testWorkspaceController();
