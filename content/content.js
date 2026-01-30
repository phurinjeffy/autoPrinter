// Content script for Shopee Mass Shipment page
// Listens for messages from the popup and interacts with the page DOM

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
        // Simple ping to check if content script is loaded
        sendResponse({ success: true });
    }
    else if (request.action === 'getShippingMethods') {
        const methods = getShippingMethods();
        sendResponse({ success: true, methods });
    }
    else if (request.action === 'selectShippingAndOrders') {
        selectShippingAndOrders(request.shippingValue)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open for async response
    }
    else if (request.action === 'arrangePickup') {
        arrangePickup()
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open for async response
    }
    else if (request.action === 'generateLabel') {
        generateLabel()
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open for async response
    }
    else if (request.action === 'collapseGeneratePopup') {
        collapseGeneratePopup()
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open for async response
    }
    return true;
});

// Collapse the generate label popup/panel
function collapseGeneratePopup() {
    return new Promise((resolve) => {
        try {
            // Find the collapse button - it contains "ย่อ" text
            const collapseButton = document.querySelector('.collapse');

            if (collapseButton) {
                console.log('[AutoPrinter] Found collapse button, clicking...');
                collapseButton.click();

                // Wait a moment for the popup to close
                setTimeout(() => {
                    resolve({ success: true });
                }, 500);
            } else {
                // No popup open, that's fine
                console.log('[AutoPrinter] No collapse button found, popup may already be closed');
                resolve({ success: true });
            }
        } catch (err) {
            console.error('[AutoPrinter] Error collapsing popup:', err);
            resolve({ success: false, error: err.message });
        }
    });
}

// Get all shipping methods from the page
function getShippingMethods() {
    const methods = [];

    try {
        // Find the shipping channel filter container
        const shippingFilter = document.querySelector('.shipping-channel-filter');
        if (!shippingFilter) {
            console.log('[AutoPrinter] No shipping filter found');
            return methods;
        }

        // Find all radio button labels within the shipping channel filter
        const radioLabels = shippingFilter.querySelectorAll('label.eds-radio-button');

        radioLabels.forEach(label => {
            const input = label.querySelector('input.eds-radio-button__input');
            if (!input) return;

            const value = input.value;

            // Get the carrier name from span with label attribute
            const nameSpan = label.querySelector('span[label]');
            const metaSpan = label.querySelector('span.meta');

            let name = '';
            let count = 0;

            if (nameSpan) {
                name = nameSpan.textContent.trim();
            }

            if (metaSpan) {
                // Extract count from "(X)" format
                const countMatch = metaSpan.textContent.match(/\((\d+)\)/);
                if (countMatch) {
                    count = parseInt(countMatch[1], 10);
                }
            }

            if (name && value) {
                methods.push({ name, count, value });
            }
        });

        console.log('[AutoPrinter] Found shipping methods:', methods);
    } catch (err) {
        console.error('[AutoPrinter] Error parsing shipping methods:', err);
    }

    return methods;
}

// Helper function to wait for checkbox to become enabled (table finished loading)
function waitForCheckboxEnabled(maxAttempts = 10, interval = 300) {
    return new Promise((resolve) => {
        let attempts = 0;

        const checkEnabled = () => {
            attempts++;
            const headerCheckbox = document.querySelector('[data-testid="mass-ship-checkbox-all"]');

            // Check if loading indicator is visible
            const loadingContainer = document.querySelector('.table-loading-container');
            const isLoading = loadingContainer && loadingContainer.style.display !== 'none';

            if (isLoading) {
                console.log('[AutoPrinter] Table still loading, waiting...');
                if (attempts < maxAttempts) {
                    setTimeout(checkEnabled, interval);
                } else {
                    resolve({ ready: false, error: 'Timeout waiting for table to load' });
                }
                return;
            }

            if (!headerCheckbox) {
                if (attempts < maxAttempts) {
                    setTimeout(checkEnabled, interval);
                } else {
                    resolve({ ready: false, error: 'Checkbox not found' });
                }
                return;
            }

            // Check if checkbox is enabled (not disabled)
            if (!headerCheckbox.classList.contains('disabled')) {
                resolve({ ready: true, checkbox: headerCheckbox });
            } else if (attempts < maxAttempts) {
                console.log('[AutoPrinter] Checkbox still disabled, attempt', attempts);
                setTimeout(checkEnabled, interval);
            } else {
                // After all attempts, it's truly disabled (no orders)
                resolve({ ready: false, error: 'No orders available for this carrier' });
            }
        };

        checkEnabled();
    });
}

// Select a shipping method and check all orders
function selectShippingAndOrders(shippingValue) {
    return new Promise((resolve) => {
        try {
            // Find the shipping channel filter container
            const shippingFilter = document.querySelector('.shipping-channel-filter');
            if (!shippingFilter) {
                resolve({ success: false, error: 'Shipping filter not found' });
                return;
            }

            // Find and click the radio button for this shipping method
            const radioInput = shippingFilter.querySelector(
                `input.eds-radio-button__input[value="${shippingValue}"]`
            );

            if (!radioInput) {
                resolve({ success: false, error: 'Shipping method not found' });
                return;
            }

            // Click the radio button's parent label
            const label = radioInput.closest('label.eds-radio-button');
            if (label) {
                label.click();
                console.log('[AutoPrinter] Clicked shipping filter:', shippingValue);
            } else {
                radioInput.click();
            }

            // Wait for table to load and checkbox to become enabled
            // Start after a brief initial delay to let the filter trigger
            setTimeout(async () => {
                try {
                    // Wait for the checkbox to become enabled (polling)
                    const result = await waitForCheckboxEnabled();

                    if (!result.ready) {
                        resolve({ success: false, error: result.error });
                        return;
                    }

                    const headerCheckbox = result.checkbox;

                    // Find the actual input element inside the checkbox
                    const checkboxInput = headerCheckbox.querySelector('input.eds-checkbox__input');

                    if (!checkboxInput) {
                        resolve({ success: false, error: 'Checkbox input not found' });
                        return;
                    }

                    // Only click if NOT already checked (to avoid toggling off)
                    if (!checkboxInput.checked) {
                        headerCheckbox.click();
                        console.log('[AutoPrinter] Clicked select all checkbox');
                    } else {
                        console.log('[AutoPrinter] Orders already selected, skipping click');
                    }

                    // Count selected orders after a brief delay
                    setTimeout(() => {
                        // Get count from the selection panel which shows "X parcels selected"
                        let count = 0;

                        const selectedPanel = document.querySelector('.mass-ship-selected .subtitle span');
                        if (selectedPanel) {
                            const selectedCount = parseInt(selectedPanel.textContent, 10);
                            if (!isNaN(selectedCount)) {
                                count = selectedCount;
                            }
                        }

                        // Fallback: count from parcel count element
                        if (count === 0) {
                            const parcelCountEl = document.querySelector('[data-testid="mass-ship-parcel-count"]');
                            if (parcelCountEl) {
                                const countMatch = parcelCountEl.textContent.match(/(\d+)/);
                                if (countMatch) {
                                    count = parseInt(countMatch[1], 10);
                                }
                            }
                        }

                        resolve({
                            success: true,
                            selectedCount: count
                        });
                    }, 500);

                } catch (err) {
                    resolve({ success: false, error: err.message });
                }
            }, 1000); // Wait for filter to apply

        } catch (err) {
            resolve({ success: false, error: err.message });
        }
    });
}

// Helper function to wait for arrange pickup button to be enabled
function waitForPickupButtonEnabled(maxAttempts = 10, interval = 300) {
    return new Promise((resolve) => {
        let attempts = 0;

        const checkEnabled = () => {
            attempts++;
            const pickupButton = document.querySelector('[data-testid="arrange-pickup-confirm-button"]');

            if (!pickupButton) {
                if (attempts < maxAttempts) {
                    setTimeout(checkEnabled, interval);
                } else {
                    resolve({ ready: false, error: 'Arrange pickup button not found' });
                }
                return;
            }

            // Check if button is disabled
            if (!pickupButton.disabled && !pickupButton.classList.contains('eds-button--disabled')) {
                resolve({ ready: true, button: pickupButton });
            } else if (attempts < maxAttempts) {
                console.log('[AutoPrinter] Pickup button still disabled, attempt', attempts);
                setTimeout(checkEnabled, interval);
            } else {
                resolve({ ready: false, error: 'Arrange pickup button is disabled' });
            }
        };

        checkEnabled();
    });
}

// Click the arrange pickup button
function arrangePickup() {
    return new Promise(async (resolve) => {
        try {
            // Wait for the button to be enabled
            const result = await waitForPickupButtonEnabled();

            if (!result.ready) {
                resolve({ success: false, error: result.error });
                return;
            }

            const pickupButton = result.button;
            pickupButton.click();
            console.log('[AutoPrinter] Clicked arrange pickup button');

            resolve({ success: true });

        } catch (err) {
            resolve({ success: false, error: err.message });
        }
    });
}

// Helper function to wait for generate button to appear and be enabled
function waitForGenerateButtonEnabled(maxAttempts = 20, interval = 500) {
    return new Promise((resolve) => {
        let attempts = 0;

        const checkEnabled = () => {
            attempts++;
            const generateButton = document.querySelector('[data-testid="generate-doc-for-arranged-shipment-orders"]');

            if (!generateButton) {
                if (attempts < maxAttempts) {
                    console.log('[AutoPrinter] Generate button not found, attempt', attempts);
                    setTimeout(checkEnabled, interval);
                } else {
                    resolve({ ready: false, error: 'Generate button not found' });
                }
                return;
            }

            // Check if button is disabled
            if (!generateButton.disabled && !generateButton.classList.contains('eds-button--disabled')) {
                resolve({ ready: true, button: generateButton });
            } else if (attempts < maxAttempts) {
                console.log('[AutoPrinter] Generate button still disabled, attempt', attempts);
                setTimeout(checkEnabled, interval);
            } else {
                resolve({ ready: false, error: 'Generate button is disabled' });
            }
        };

        checkEnabled();
    });
}

// Helper function to wait for PDF option to appear in dropdown
function waitForPdfOption(maxAttempts = 15, interval = 300) {
    return new Promise((resolve) => {
        let attempts = 0;

        const checkOption = () => {
            attempts++;
            const pdfOption = document.querySelector('[data-testid="doc-type-NORMAL_PDF"]');

            if (pdfOption) {
                console.log('[AutoPrinter] Found PDF option');
                resolve({ ready: true, option: pdfOption });
            } else if (attempts < maxAttempts) {
                console.log('[AutoPrinter] PDF option not found, attempt', attempts);
                setTimeout(checkOption, interval);
            } else {
                resolve({ ready: false, error: 'PDF option not found in dropdown' });
            }
        };

        checkOption();
    });
}

// Click an element using multiple methods to ensure it registers
async function clickElement(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    console.log('[AutoPrinter] Clicking at coordinates:', centerX, centerY);

    // Method 1: Direct native click
    element.click();
    await new Promise(r => setTimeout(r, 100));

    // Method 2: Simulate full mouse interaction sequence
    const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 1,
        clientX: centerX,
        clientY: centerY
    });
    element.dispatchEvent(mouseDownEvent);

    await new Promise(r => setTimeout(r, 100));

    const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 0,
        clientX: centerX,
        clientY: centerY
    });
    element.dispatchEvent(mouseUpEvent);

    await new Promise(r => setTimeout(r, 50));

    const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        clientX: centerX,
        clientY: centerY
    });
    element.dispatchEvent(clickEvent);

    console.log('[AutoPrinter] Click events dispatched on element');
}

// Alternative click using elementFromPoint
async function clickAtCoordinates(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element) {
        console.log('[AutoPrinter] No element at coordinates', x, y);
        return false;
    }

    console.log('[AutoPrinter] Element at point:', element.tagName, element.textContent?.substring(0, 50));

    // Simulate mouse events at the coordinates
    const events = ['mousedown', 'mouseup', 'click'];
    for (const eventType of events) {
        const event = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            clientX: x,
            clientY: y
        });
        element.dispatchEvent(event);
        await new Promise(r => setTimeout(r, 50));
    }

    return true;
}

// Trigger hover on an element using multiple methods
function triggerHover(element) {
    // Method 1: MouseEvent mouseenter/mouseover
    element.dispatchEvent(new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
        view: window
    }));

    element.dispatchEvent(new MouseEvent('mouseover', {
        bubbles: true,
        cancelable: true,
        view: window
    }));

    // Method 2: PointerEvent
    element.dispatchEvent(new PointerEvent('pointerenter', {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerType: 'mouse'
    }));

    element.dispatchEvent(new PointerEvent('pointerover', {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerType: 'mouse'
    }));

    // Method 3: Focus (some dropdowns trigger on focus)
    element.focus();

    // Method 4: MouseEvent with coordinates
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
    }));
}

// Hover on generate button and click PDF option
function generateLabel() {
    return new Promise(async (resolve) => {
        try {
            // Wait for all labels to load - check for loading indicators
            console.log('[AutoPrinter] Waiting for all labels to load...');
            await waitForLabelsToLoad();

            // Small delay after labels loaded
            await new Promise(r => setTimeout(r, 500));

            // Wait for the generate button to be enabled
            const buttonResult = await waitForGenerateButtonEnabled();

            if (!buttonResult.ready) {
                resolve({ success: false, error: buttonResult.error });
                return;
            }

            const generateButton = buttonResult.button;
            console.log('[AutoPrinter] Found generate button, triggering hover...');

            // Keep triggering hover while we look for and click the option
            const hoverInterval = setInterval(() => {
                triggerHover(generateButton);
            }, 100);

            try {
                // Try hover multiple times with delays
                let pdfOption = null;
                for (let i = 0; i < 10; i++) {
                    triggerHover(generateButton);
                    await new Promise(r => setTimeout(r, 200));

                    // Check if dropdown appeared
                    pdfOption = document.querySelector('[data-testid="doc-type-NORMAL_PDF"]');
                    if (pdfOption) {
                        console.log('[AutoPrinter] Dropdown appeared on attempt', i + 1);
                        break;
                    }
                }

                if (!pdfOption) {
                    // Try clicking the generate button to open dropdown
                    console.log('[AutoPrinter] Hover failed, trying click on generate button...');
                    generateButton.click();
                    await new Promise(r => setTimeout(r, 500));
                    pdfOption = document.querySelector('[data-testid="doc-type-NORMAL_PDF"]');
                }

                if (!pdfOption) {
                    clearInterval(hoverInterval);
                    resolve({ success: false, error: 'PDF option not found' });
                    return;
                }

                // Try multiple click methods
                console.log('[AutoPrinter] Found PDF option, trying to click...');

                // Method 1: Direct click
                console.log('[AutoPrinter] Method 1: Direct click');
                pdfOption.click();
                await new Promise(r => setTimeout(r, 300));

                if (!document.querySelector('[data-testid="doc-type-NORMAL_PDF"]')) {
                    console.log('[AutoPrinter] Method 1 worked!');
                    clearInterval(hoverInterval);
                    resolve({ success: true });
                    return;
                }

                // Method 2: Find and click the parent or container
                console.log('[AutoPrinter] Method 2: Click parent elements');
                let parent = pdfOption.parentElement;
                for (let i = 0; i < 3 && parent; i++) {
                    parent.click();
                    await new Promise(r => setTimeout(r, 200));
                    if (!document.querySelector('[data-testid="doc-type-NORMAL_PDF"]')) {
                        console.log('[AutoPrinter] Parent click worked!');
                        clearInterval(hoverInterval);
                        resolve({ success: true });
                        return;
                    }
                    parent = parent.parentElement;
                }

                // Method 3: Dispatch a trusted-like event
                console.log('[AutoPrinter] Method 3: Dispatch event on PDF option');
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: pdfOption.getBoundingClientRect().left + 10,
                    clientY: pdfOption.getBoundingClientRect().top + 10
                });
                pdfOption.dispatchEvent(clickEvent);
                await new Promise(r => setTimeout(r, 300));

                if (!document.querySelector('[data-testid="doc-type-NORMAL_PDF"]')) {
                    console.log('[AutoPrinter] Method 3 worked!');
                    clearInterval(hoverInterval);
                    resolve({ success: true });
                    return;
                }

                // Method 4: Try mousedown + mouseup sequence
                console.log('[AutoPrinter] Method 4: mousedown + mouseup sequence');
                pdfOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                await new Promise(r => setTimeout(r, 50));
                pdfOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                await new Promise(r => setTimeout(r, 50));
                pdfOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                await new Promise(r => setTimeout(r, 300));

                if (!document.querySelector('[data-testid="doc-type-NORMAL_PDF"]')) {
                    console.log('[AutoPrinter] Method 4 worked!');
                    clearInterval(hoverInterval);
                    resolve({ success: true });
                    return;
                }

                // Method 5: Try finding a clickable child or sibling
                console.log('[AutoPrinter] Method 5: Looking for clickable elements nearby');
                const allOptions = document.querySelectorAll('[data-testid*="doc-type"]');
                for (const opt of allOptions) {
                    if (opt.textContent.includes('PDF')) {
                        opt.click();
                        await new Promise(r => setTimeout(r, 200));
                    }
                }

                clearInterval(hoverInterval);

                // Final check
                await new Promise(r => setTimeout(r, 500));
                const finalCheck = !document.querySelector('[data-testid="doc-type-NORMAL_PDF"]');
                console.log('[AutoPrinter] Final check - dropdown closed:', finalCheck);

                resolve({ success: true });

            } catch (innerErr) {
                clearInterval(hoverInterval);
                throw innerErr;
            }

        } catch (err) {
            resolve({ success: false, error: err.message });
        }
    });
}

// Wait for all order labels to finish loading
function waitForLabelsToLoad(maxWaitMs = 120000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const checkInterval = 1000; // Check every 1 second
        let stableCount = 0;

        console.log('[AutoPrinter] Starting to wait for all labels to load...');

        const checkLoading = () => {
            const elapsed = Date.now() - startTime;

            // Find all status indicators with data-testid (actual order statuses, not headers)
            // These have data-testid like "OFG223431714237065-success" or similar
            const successStatuses = document.querySelectorAll('.status-col [data-testid$="-success"]');
            const allStatusDivs = document.querySelectorAll('.status-col [data-testid]');

            // Alternative: count by looking for success icons vs loading/pending icons
            const successIcons = document.querySelectorAll('.status-col .icon.success');
            const loadingIcons = document.querySelectorAll('.status-col .icon:not(.success)');

            // Use whichever method finds orders
            let successCount = successStatuses.length || successIcons.length;
            let totalOrders = allStatusDivs.length || (successIcons.length + loadingIcons.length);
            let loadingCount = totalOrders - successCount;

            // If we can't find status indicators, fall back to checking text
            if (totalOrders === 0) {
                const statusCols = document.querySelectorAll('.status-col');
                statusCols.forEach(col => {
                    // Only count columns that have actual content (not empty headers)
                    if (col.innerText.trim().length > 0) {
                        totalOrders++;
                        if (col.innerText.includes('สำเร็จ')) {
                            successCount++;
                        }
                    }
                });
                loadingCount = totalOrders - successCount;
            }

            console.log(`[AutoPrinter] Label status: ${successCount}/${totalOrders} loaded (${loadingCount} still loading, ${elapsed}ms elapsed)`);

            // All orders have success status
            if (totalOrders > 0 && successCount === totalOrders) {
                stableCount++;
                // Wait for 2 stable checks to be sure
                if (stableCount >= 2) {
                    console.log('[AutoPrinter] All labels loaded successfully!');
                    resolve();
                    return;
                }
            } else {
                stableCount = 0;
            }

            // Timeout - max 2 minutes
            if (elapsed >= maxWaitMs) {
                console.log(`[AutoPrinter] Max wait time reached. ${successCount}/${totalOrders} loaded, proceeding anyway`);
                resolve();
                return;
            }

            // Minimum wait of 2 seconds regardless
            if (elapsed < 2000) {
                setTimeout(checkLoading, checkInterval);
                return;
            }

            // Keep checking if not all loaded
            setTimeout(checkLoading, checkInterval);
        };

        // Start checking after initial delay
        setTimeout(checkLoading, 1000);
    });
}

// Notify that content script is ready
console.log('[AutoPrinter] Content script loaded on Shopee Mass Shipment page');
