// Content script for Shopee Print page
// Auto-clicks the print button when the page loads

(function () {
    console.log('[AutoPrinter] Print page script loaded');

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
            return true;
        }

        if (printButton) {
            console.log('[AutoPrinter] Print button found but not ready yet');
        }

        return false;
    }

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
