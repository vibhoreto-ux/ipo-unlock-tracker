const scraper = require('./circular-scraper');
async function test() {
    const res = await scraper.getUnlockPercentages('H.M.Electro Mech Ltd.', 'BSE SME', '2025-01-31T00:00:00.000Z');
    console.log(JSON.stringify(res, null, 2));
}
test();
