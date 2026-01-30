// Background service worker
// Enables/disables the extension based on current tab URL
// Also handles queue coordination for batch processing

const MASS_SHIP_URL = 'https://seller.shopee.co.th/portal/sale/mass/ship';
const PRINT_URL = 'https://seller.shopee.co.th/awbprint';

// Check if URL matches the Mass Shipment page
function isMassShipPage(url) {
    if (!url) return false;
    return url.startsWith(MASS_SHIP_URL);
}

// Check if URL is the print page
function isPrintPage(url) {
    if (!url) return false;
    return url.startsWith(PRINT_URL);
}

// Update extension state for a tab
async function updateExtensionState(tabId, url) {
    if (isMassShipPage(url)) {
        await chrome.action.enable(tabId);
    } else {
        await chrome.action.disable(tabId);
    }
}

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        await updateExtensionState(activeInfo.tabId, tab.url);
    } catch (error) {
        // Tab might not exist anymore
        console.log('Error updating state:', error);
    }
});

// Listen for tab URL changes (navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
        await updateExtensionState(tabId, tab.url);
    }
});

// Listen for print page tab closing - continue queue if needed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    try {
        const data = await chrome.storage.local.get(['autoPrintQueue', 'currentQueueIndex', 'originalTabId', 'isQueueRunning', 'printTabId']);

        // Check if this was the print tab and queue is running
        if (data.isQueueRunning && data.printTabId === tabId) {
            console.log('[Background] Print tab closed, continuing queue...');

            const nextIndex = (data.currentQueueIndex || 0) + 1;
            const queue = data.autoPrintQueue || [];

            if (nextIndex < queue.length) {
                // There are more carriers to process
                // Wait a moment then tell popup to continue
                setTimeout(async () => {
                    try {
                        // Send message to popup to continue
                        await chrome.runtime.sendMessage({
                            action: 'continueQueue',
                            nextIndex: nextIndex
                        });
                    } catch (err) {
                        // Popup might be closed, try sending to the original tab
                        console.log('[Background] Could not reach popup, queue may have ended');
                    }
                }, 1000);
            } else {
                // Queue finished
                console.log('[Background] Queue completed!');
                await chrome.storage.local.remove(['autoPrintQueue', 'currentQueueIndex', 'originalTabId', 'isQueueRunning', 'printTabId']);
            }
        }
    } catch (error) {
        console.log('[Background] Error handling tab close:', error);
    }
});

// Listen for messages from print page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'printCompleted') {
        console.log('[Background] Print completed, storing print tab ID');
        // Store the print tab ID so we can detect when it closes
        chrome.storage.local.set({ printTabId: sender.tab.id });
        sendResponse({ received: true });
    }
    return true;
});

// Set initial state for all tabs when extension loads
chrome.runtime.onInstalled.addListener(async () => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        await updateExtensionState(tab.id, tab.url);
    }
    // Clear any stale queue data on install
    await chrome.storage.local.remove(['autoPrintQueue', 'currentQueueIndex', 'originalTabId', 'isQueueRunning', 'printTabId']);
});

// Also check on startup
chrome.runtime.onStartup.addListener(async () => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        await updateExtensionState(tab.id, tab.url);
    }
    // Clear any stale queue data on startup
    await chrome.storage.local.remove(['autoPrintQueue', 'currentQueueIndex', 'originalTabId', 'isQueueRunning', 'printTabId']);
});
