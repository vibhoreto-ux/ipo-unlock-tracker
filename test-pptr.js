const puppeteer = require('puppeteer-core');
const fs = require('fs');
async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: 'new'
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    console.log('Navigating to HM Electro PDF...');
    const response = await page.goto('https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250130-45&attachedId=6c2ef65e-26f5-430c-84ed-e4324f114681', { waitUntil: 'networkidle2' });
    const buffer = await response.buffer();
    fs.writeFileSync('/tmp/hm_electro.pdf', buffer);
    console.log('Saved PDF: ' + buffer.length + ' bytes');
    await browser.close();
}
run();
