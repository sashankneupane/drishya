import { WorkspaceController } from "./WorkspaceController.js";

function testWorkspaceController() {
    console.log("Running WorkspaceController tests...");
    const controller = new WorkspaceController({ theme: "dark" });

    // Test initial state
    const initialState = controller.getState();
    if (initialState.theme !== "dark") throw new Error("Initial theme should be dark");

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

    console.log("WorkspaceController tests passed!");
}

testWorkspaceController();
