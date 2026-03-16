const scraper = require('./circular-scraper');

async function test() {
    console.log("Testing Shanmuga Hospital Ltd.");
    const res = await scraper.getUnlockPercentages("Shanmuga Hospital Ltd.", "BSE SME", "2025-02-14T00:00:00.000Z");
    console.log("Result:", JSON.stringify(res, null, 2));
}
test();
