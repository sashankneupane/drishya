import { WorkspaceController, normalizePaneRatios } from "./WorkspaceController.js";
import { PRICE_PANE_ID } from "../models/constants.js";

function testWorkspaceController() {
    console.log("Running WorkspaceController tests...");
    const controller = new WorkspaceController({ theme: "dark" });

    // Test initial state
    const initialState = controller.getState();
    if (initialState.theme !== "dark") throw new Error("Initial theme should be dark");
    if (initialState.paneLayout.order[0] !== PRICE_PANE_ID) throw new Error("Primary pane should be price");
    if (initialState.activeChartPaneId !== PRICE_PANE_ID) throw new Error("Initial active chart pane should be price");
    if (initialState.chartLayoutTree.type !== "leaf") throw new Error("Initial chart layout should be a leaf");

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

    // Test chart pane split lifecycle
    const chart2 = controller.addChartPane();
    state = controller.getState();
    if (chart2 !== "chart-2") throw new Error("Chart pane ids should be deterministic");
    if (!state.chartPanes[chart2]) throw new Error("New chart pane should be registered");
    if (state.chartLayoutTree.type !== "split") throw new Error("Layout should become split after addChartPane");
    if (state.activeChartPaneId !== chart2) throw new Error("Active chart pane should move to new pane");

    const chart3 = controller.splitChartPane(chart2, "vertical");
    state = controller.getState();
    if (chart3 !== "chart-3") throw new Error("splitChartPane should create deterministic id");
    if (!state.chartPanes[chart3]) throw new Error("Split pane should be present");
    controller.setActiveChartPane(PRICE_PANE_ID);
    if (controller.getState().activeChartPaneId !== PRICE_PANE_ID) throw new Error("setActiveChartPane should work");
    controller.removeChartPane(chart3);
    if (controller.getState().chartPanes[chart3]) throw new Error("removeChartPane should remove pane");
    if (controller.getState().activeChartPaneId !== PRICE_PANE_ID) throw new Error("Active pane should fallback to price after removing active pane");

    // Test pane-scoped source routing state
    controller.setChartPaneSource(PRICE_PANE_ID, { symbol: "BTCUSDT", timeframe: "1m" });
    controller.setChartPaneSource(chart2, { symbol: "ETHUSDT", timeframe: "5m" });
    state = controller.getState();
    if (state.chartPaneSources[PRICE_PANE_ID]?.symbol !== "BTCUSDT") throw new Error("Price pane source symbol mismatch");
    if (state.chartPaneSources[chart2]?.symbol !== "ETHUSDT") throw new Error("Secondary pane source symbol mismatch");
    if (state.chartPaneSources[chart2]?.timeframe !== "5m") throw new Error("Secondary pane source timeframe mismatch");

    // Removing a chart pane should clean up pane-scoped source state
    controller.removeChartPane(chart2);
    state = controller.getState();
    if (state.chartPaneSources[chart2]) throw new Error("Removed pane source state should be cleaned up");

    // Indicators owned by removed pane should be re-parented to price pane
    const orphanPaneId = "orphan-ind";
    controller.registerPane({ id: orphanPaneId, kind: "indicator", title: "Orphan", parentChartPaneId: chart2 });
    controller.removeChartPane(chart2);
    state = controller.getState();
    if (state.paneLayout.panes[orphanPaneId]?.parentChartPaneId !== PRICE_PANE_ID) {
        throw new Error("Indicator panes should be re-parented to price pane after chart removal");
    }

    // Split ratio updates should apply deterministically to split root
    const splitA = controller.addChartPane();
    const splitB = controller.splitChartPane(splitA, "vertical");
    controller.setChartSplitRatio([], 0.3);
    state = controller.getState();
    if (state.chartLayoutTree.type !== "split") throw new Error("Expected split tree after pane split");
    if (Math.abs(state.chartLayoutTree.ratio - 0.3) > 0.0001) throw new Error("Root split ratio should be updated");
    controller.removeChartPane(splitB);
    controller.removeChartPane(splitA);

    // Workspace tile and chart-tab state
    state = controller.getState();
    const chartTileId = state.activeChartTileId;
    if (!state.chartTiles[chartTileId]) throw new Error("Active chart tile should exist");
    const createdTab = controller.addChartTab(chartTileId);
    if (!createdTab) throw new Error("addChartTab should return tab id");
    state = controller.getState();
    if (!state.chartTiles[chartTileId].tabs.some((tab) => tab.id === createdTab)) {
        throw new Error("New tab should be attached to chart tile");
    }
    controller.setActiveChartTab(chartTileId, createdTab);
    state = controller.getState();
    if (state.chartTiles[chartTileId].activeTabId !== createdTab) {
        throw new Error("setActiveChartTab should switch active tab");
    }
    controller.moveWorkspaceTile("tile-objects", 0);
    state = controller.getState();
    if (state.workspaceTileOrder[0] !== "tile-objects") {
        throw new Error("moveWorkspaceTile should reorder tiles");
    }
    controller.updateWorkspaceTileRatios({ "tile-chart-1": 0.8, "tile-objects": 0.2 });
    state = controller.getState();
    const ratioSum = (state.workspaceTiles["tile-chart-1"]?.widthRatio ?? 0) + (state.workspaceTiles["tile-objects"]?.widthRatio ?? 0);
    if (Math.abs(ratioSum - 1.0) > 0.001) throw new Error("Workspace tile ratios should normalize to 1");

    // Load workspace tiles payload should preserve active chart tile/tab linkage
    controller.loadWorkspaceTiles(
        {
            "tile-chart-9": { id: "tile-chart-9", kind: "chart", title: "Chart", widthRatio: 0.7, chartTileId: "chart-tile-9" },
            "tile-objects": { id: "tile-objects", kind: "objects", title: "Objects", widthRatio: 0.3 }
        },
        ["tile-chart-9", "tile-objects"],
        {
            "chart-tile-9": {
                id: "chart-tile-9",
                tabs: [{ id: "tab-9", title: "Main", chartPaneId: PRICE_PANE_ID }],
                activeTabId: "tab-9"
            }
        },
        "chart-tile-9"
    );
    state = controller.getState();
    if (state.activeChartTileId !== "chart-tile-9") throw new Error("loadWorkspaceTiles should restore active chart tile");
    if (state.workspaceTileOrder[0] !== "tile-chart-9") throw new Error("loadWorkspaceTiles should restore tile order");

    // Test cleanupEmptyIndicatorPanes
    controller.registerPane({ id: "ind-to-clean", kind: "indicator", title: "CleanMe" });
    const rsiPaneId = "ind-to-clean";
    const treeState: any = {
        series: [{ id: "main", name: "Main", pane_id: PRICE_PANE_ID, visible: true, deleted: false }],
        panes: [{ id: PRICE_PANE_ID, visible: true }, { id: rsiPaneId, visible: true }]
    };
    controller.cleanupEmptyIndicatorPanes(treeState);
    if (controller.getState().paneLayout.panes[rsiPaneId]) throw new Error("Empty indicator pane should be cleaned up");

    // Test crosshair state propagation
    controller.setCrosshair({ x: 100, index: 5, timestamp: 1234, readouts: [{ paneId: PRICE_PANE_ID, value: 50.5 }] });
    if (controller.getState().crosshair?.x !== 100) throw new Error("Crosshair state update failed");

    // Test loadPaneLayout
    const newLayout: any = {
        order: [PRICE_PANE_ID],
        ratios: { [PRICE_PANE_ID]: 1.0 },
        panes: { [PRICE_PANE_ID]: { id: PRICE_PANE_ID, kind: "price", title: "Restored" } },
        visibility: { [PRICE_PANE_ID]: true },
        collapsed: { [PRICE_PANE_ID]: false }
    };
    controller.loadPaneLayout(newLayout);
    if (controller.getState().paneLayout.panes[PRICE_PANE_ID]?.title !== "Restored") throw new Error("loadPaneLayout failed");

    console.log("WorkspaceController tests passed!");
}

testWorkspaceController();
