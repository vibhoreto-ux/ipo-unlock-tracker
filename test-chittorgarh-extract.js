const { scrapeWithBrowser } = require('./browser-scraper');
async function test() {
    const data = await scrapeWithBrowser(2025);
    console.log("First item:", data[0]);
    console.log("Found Chittorgarh URLs:", data.filter(d => d.chittorgarhUrl).length);
}
test();
