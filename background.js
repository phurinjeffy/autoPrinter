// Background service worker
// Enables/disables the extension based on current tab URL

const MASS_SHIP_URL = 'https://seller.shopee.co.th/portal/sale/mass/ship';

// Check if URL matches the Mass Shipment page
function isMassShipPage(url) {
    if (!url) return false;
    return url.startsWith(MASS_SHIP_URL);
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

// Set initial state for all tabs when extension loads
chrome.runtime.onInstalled.addListener(async () => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        await updateExtensionState(tab.id, tab.url);
    }
});

// Also check on startup
chrome.runtime.onStartup.addListener(async () => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        await updateExtensionState(tab.id, tab.url);
    }
});
