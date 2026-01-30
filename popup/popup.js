// DOM Elements
const shippingSection = document.getElementById('shipping-section');
const shippingButtons = document.getElementById('shipping-buttons');
const shippingStatus = document.getElementById('shipping-status');

// Current tab reference
let currentTabId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    await loadShippingMethods();
});

// Ensure content script is loaded, inject if needed
async function ensureContentScriptLoaded() {
    try {
        // Try to ping the content script
        const response = await chrome.tabs.sendMessage(currentTabId, { action: 'ping' });
        return response?.success === true;
    } catch (error) {
        // Content script not loaded, inject it
        console.log('Content script not loaded, injecting...');
        try {
            await chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                files: ['content/content.js']
            });
            // Wait a bit for script to initialize
            await new Promise(resolve => setTimeout(resolve, 300));
            return true;
        } catch (injectError) {
            console.error('Failed to inject content script:', injectError);
            return false;
        }
    }
}

// Load shipping methods from the page using message passing to content script
async function loadShippingMethods() {
    try {
        // First ensure the content script is loaded
        const scriptReady = await ensureContentScriptLoaded();
        if (!scriptReady) {
            throw new Error('Could not load content script');
        }

        // Send message to content script to get shipping methods
        const response = await chrome.tabs.sendMessage(currentTabId, {
            action: 'getShippingMethods'
        });

        if (!response || !response.success) {
            throw new Error(response?.error || 'No response from page');
        }

        const shippingMethods = response.methods || [];

        console.log('Found shipping methods:', shippingMethods);

        // Filter methods with orders > 0
        const availableMethods = shippingMethods.filter(m => m.count > 0);

        // Show shipping section
        shippingSection.classList.remove('hidden');

        if (shippingMethods.length === 0) {
            shippingButtons.innerHTML = '<div class="no-orders-message">Could not find shipping filters. Please refresh the page.</div>';
            return;
        }

        if (availableMethods.length === 0) {
            shippingButtons.innerHTML = '<div class="no-orders-message">No orders ready to ship</div>';
            return;
        }

        // Create buttons for each shipping method
        shippingButtons.innerHTML = '';
        availableMethods.forEach(method => {
            const btn = document.createElement('button');
            btn.className = 'shipping-btn';
            btn.innerHTML = `
                <span class="carrier-name">${method.name}</span>
                <span class="order-count">${method.count} orders</span>
            `;
            btn.addEventListener('click', () => handleShippingClick(method, btn));
            shippingButtons.appendChild(btn);
        });

    } catch (error) {
        console.error('Error loading shipping methods:', error);
        shippingSection.classList.remove('hidden');
        shippingButtons.innerHTML = `<div class="no-orders-message">Error: ${error.message}. Try refreshing the page.</div>`;
    }
}

// Handle shipping button click
async function handleShippingClick(method, button) {
    // Prevent double-click
    if (button.classList.contains('loading')) return;

    button.classList.add('loading');
    shippingStatus.className = 'shipping-status';
    shippingStatus.textContent = `Selecting ${method.name}...`;

    try {
        // Step 1: Select shipping and orders
        const result = await chrome.tabs.sendMessage(currentTabId, {
            action: 'selectShippingAndOrders',
            shippingValue: method.value
        });

        if (!result?.success) {
            throw new Error(result?.error || 'Failed to select orders');
        }

        shippingStatus.textContent = `✓ Selected ${result.selectedCount} orders. Arranging pickup...`;

        // Step 2: Click arrange pickup button
        const pickupResult = await chrome.tabs.sendMessage(currentTabId, {
            action: 'arrangePickup'
        });

        if (!pickupResult?.success) {
            throw new Error(pickupResult?.error || 'Failed to arrange pickup');
        }

        shippingStatus.textContent = `✓ Arranged pickup. Generating labels...`;

        // Step 3: Hover on generate button and click PDF option
        const generateResult = await chrome.tabs.sendMessage(currentTabId, {
            action: 'generateLabel'
        });

        if (!generateResult?.success) {
            throw new Error(generateResult?.error || 'Failed to generate label');
        }

        // Success!
        button.classList.remove('loading');
        button.classList.add('success');
        shippingStatus.className = 'shipping-status success';
        shippingStatus.textContent = `✓ Generated labels for ${result.selectedCount} orders (${method.name})`;

        // Reset button after 2 seconds
        setTimeout(() => {
            button.classList.remove('success');
        }, 2000);

    } catch (error) {
        console.error('Error:', error);
        button.classList.remove('loading');
        shippingStatus.className = 'shipping-status error';
        shippingStatus.textContent = `Error: ${error.message}`;
    }
}
