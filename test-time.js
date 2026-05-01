const { scrapeWithBrowser } = require('./browser-scraper.js');
const fs = require('fs');

async function test() {
    const db = JSON.parse(fs.readFileSync('./data/unlock-data.json', 'utf8'));
    console.time("Scrape 2026");
    const data26 = await scrapeWithBrowser(2026, db.companies);
    console.timeEnd("Scrape 2026");
    console.log("Success! Extracted companies:", data26.length);
}
test();
