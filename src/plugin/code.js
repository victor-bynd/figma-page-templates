// ---------------------------------------------------------------------------
// Helper to post a typed message back to the UI iframe.
// ---------------------------------------------------------------------------
function postToUI(message) {
    figma.ui.postMessage(message);
}
// ---------------------------------------------------------------------------
// Stub handlers — will be replaced with real implementations in later sprints.
// ---------------------------------------------------------------------------
function handleCaptureStructure() {
    console.log('[Plugin] CAPTURE_STRUCTURE received — stub');
    // Sprint 3.1: wire to captureStructure() and post STRUCTURE_CAPTURED
}
function handleApplyTemplate(pages) {
    console.log('[Plugin] APPLY_TEMPLATE received — stub', pages);
    // Sprint 3.3: wire to applyTemplate()
}
function handlePlaceCover(componentKey) {
    console.log('[Plugin] PLACE_COVER received — stub', componentKey);
    // Sprint 4.2: wire to cover functions
}
function handleGetTextLayers() {
    console.log('[Plugin] GET_TEXT_LAYERS received — stub');
    // Sprint 4.2: wire to getTextLayers()
}
function handleSetOverrides(msg) {
    console.log('[Plugin] SET_OVERRIDES received — stub', msg.overrides);
    // Sprint 4.2: wire to applyTextOverrides() + optional swapCoverImage()
}
// ---------------------------------------------------------------------------
// Message dispatcher
// ---------------------------------------------------------------------------
figma.ui.onmessage = function (raw) {
    var message = raw;
    switch (message.type) {
        case 'CAPTURE_STRUCTURE':
            handleCaptureStructure();
            break;
        case 'APPLY_TEMPLATE':
            handleApplyTemplate(message);
            break;
        case 'PLACE_COVER':
            handlePlaceCover(message.componentKey);
            break;
        case 'GET_TEXT_LAYERS':
            handleGetTextLayers();
            break;
        case 'SET_OVERRIDES':
            handleSetOverrides(message);
            break;
        default: {
            var exhaustive = message;
            console.warn('[Plugin] Unknown message type:', exhaustive.type);
        }
    }
};
// ---------------------------------------------------------------------------
// Open the plugin UI
// ---------------------------------------------------------------------------
figma.showUI(__html__, { width: 360, height: 560, themeColors: true });
export {};
