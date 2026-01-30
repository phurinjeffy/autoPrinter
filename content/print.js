// Content script for Shopee Print page
// Auto-clicks the print button when the page loads
// Also handles auto-close after printing for batch mode

(function () {
    console.log('[AutoPrinter] Print page script loaded');

    let printButtonClicked = false;

    // Function to check if button is ready (not disabled, not loading)
    function isButtonReady(button) {
        // Check common disabled states
        if (button.disabled) return false;
        if (button.classList.contains('disabled')) return false;
        if (button.classList.contains('loading')) return false;
        if (button.classList.contains('shopee-react-button--loading')) return false;

        // Check if there's a loading spinner inside
        const spinner = button.querySelector('.loading, .spinner, [class*="loading"]');
        if (spinner) return false;

        return true;
    }

    // Function to find and click print button
    function clickPrintButton() {
        const printButton = document.querySelector('[data-testid="print-button"]');

        if (printButton && isButtonReady(printButton)) {
            console.log('[AutoPrinter] Found print button and it is ready, clicking...');
            printButton.click();
            printButtonClicked = true;

            // Notify background script that print was triggered
            chrome.runtime.sendMessage({ action: 'printCompleted' });

            return true;
        }

        if (printButton) {
            console.log('[AutoPrinter] Print button found but not ready yet');
        }

        return false;
    }

    // Handle after print - check if we're in batch mode and should auto-close
    window.onafterprint = async function () {
        console.log('[AutoPrinter] Print dialog closed');

        try {
            const data = await chrome.storage.local.get(['isQueueRunning']);

            if (data.isQueueRunning) {
                console.log('[AutoPrinter] Batch mode active, auto-closing tab in 1 second...');
                // Wait a moment then close the tab
                setTimeout(() => {
                    window.close();
                }, 1000);
            }
        } catch (error) {
            console.log('[AutoPrinter] Error checking queue status:', error);
        }
    };

    // Wait for initial page load
    const initialDelay = 2000; // Wait 2 seconds for page to start loading
    console.log('[AutoPrinter] Waiting', initialDelay, 'ms for page to load...');

    setTimeout(() => {
        // Try to click immediately after initial delay
        if (clickPrintButton()) {
            return;
        }

        // If not found/ready, keep checking
        let attempts = 0;
        const maxAttempts = 60; // 60 attempts = 30 seconds max wait
        const interval = 500; // Check every 500ms

        const checkForButton = setInterval(() => {
            attempts++;

            if (attempts % 10 === 0) {
                console.log('[AutoPrinter] Still waiting for print button, attempt', attempts);
            }

            if (clickPrintButton()) {
                clearInterval(checkForButton);
                return;
            }

            if (attempts >= maxAttempts) {
                console.log('[AutoPrinter] Print button not ready after', maxAttempts, 'attempts (30 seconds)');
                clearInterval(checkForButton);
            }
        }, interval);
    }, initialDelay);
})();
