const { scrapeWithBrowser } = require('./browser-scraper.js');
const fs = require('fs');

async function test() {
    const db = JSON.parse(fs.readFileSync('./data/unlock-data.json', 'utf8'));
    console.log("Testing scraper for 2026 with db.companies");
    const data26 = await scrapeWithBrowser(2026, db.companies);
    console.log("Success! Extracted companies:", data26.length);
}
test();
