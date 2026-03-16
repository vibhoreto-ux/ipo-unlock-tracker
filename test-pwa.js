const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Listen for console logs from the page (specifically SW registration)
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    
    // Check if manifest exists in DOM
    const hasManifest = await page.evaluate(() => {
        return !!document.querySelector('link[rel="manifest"]');
    });
    console.log('Manifest linked:', hasManifest);

    // Check if SW is controlling the page
    const hasSW = await page.evaluate(async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.length > 0;
    });
    console.log('Service Worker Registered:', hasSW);

    await browser.close();
})();
