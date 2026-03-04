import { render } from '@create-figma-plugin/ui';
import { h } from 'preact';
import { useEffect } from 'preact/hooks';
// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------
/** Send a typed message from the UI iframe to the plugin main thread. */
export function sendMessage(message) {
    parent.postMessage({ pluginMessage: message }, '*');
}
// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
function App() {
    useEffect(function () {
        // Receive messages from the plugin main thread.
        window.onmessage = function (event) {
            var _a;
            var message = (_a = event.data) === null || _a === void 0 ? void 0 : _a.pluginMessage;
            if (!message)
                return;
            switch (message.type) {
                case 'STRUCTURE_CAPTURED':
                    console.log('[UI] STRUCTURE_CAPTURED', message.pages);
                    break;
                case 'TEMPLATE_APPLIED':
                    console.log('[UI] TEMPLATE_APPLIED');
                    break;
                case 'COVER_PLACED':
                    console.log('[UI] COVER_PLACED');
                    break;
                case 'TEXT_LAYERS_RESULT':
                    console.log('[UI] TEXT_LAYERS_RESULT', message.layers);
                    break;
                case 'ERROR':
                    console.error('[UI] ERROR', message.code, message.message);
                    break;
                default: {
                    var exhaustive = message;
                    console.warn('[UI] Unknown message type:', exhaustive);
                }
            }
        };
        // Send a test message on mount so we can verify the channel works.
        sendMessage({ type: 'CAPTURE_STRUCTURE' });
        return function () {
            window.onmessage = null;
        };
    }, []);
    return (h("div", { style: { padding: '16px', fontFamily: 'Inter, sans-serif' } },
        h("h2", { style: { margin: 0, fontSize: '14px', fontWeight: 600 } }, "Page Templates"),
        h("p", { style: { marginTop: '8px', fontSize: '12px', color: '#888' } }, "Plugin loaded successfully.")));
}
export default render(App);
