const scraper = require('./circular-scraper');
const { downloadBSEPDF } = require('./circular-scraper');
const pdf = require('pdf-parse');

async function test() {
    process.env.DEBUG = "1";
    
    // HM Electro 20250130-45
    // Shanmuga 20250220-33
    console.log("--- HM ELECTRO ---");
    const hmBuffer = await downloadBSEPDF('https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250130-45&attachedId=4bb8daf7-d3c7-4479-b230-ca6bb0a783af');
    const hmRes = await scraper.parseLockInData(hmBuffer, 'BSE');
    console.log(hmRes.unlockEvents);
    
    console.log("\n--- SHANMUGA ---");
    const shBuffer = await downloadBSEPDF('https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250220-33&attachedId=491341c3-7260-4081-bda9-1707b83576a0');
    const shRes = await scraper.parseLockInData(shBuffer, 'BSE');
    console.log(shRes.unlockEvents);
}
test();
