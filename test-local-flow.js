const scraper = require('./circular-scraper');

async function test() {
    console.log("Testing H.M.Electro Mech Ltd.");
    const res = await scraper.getUnlockPercentages("H.M.Electro Mech Ltd.", "BSE SME", "2025-01-31T00:00:00.000Z");
    console.log("Result:", res);
}
test();
