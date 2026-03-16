const { downloadBSEPDF } = require('./circular-scraper');
const pdf = require('pdf-parse');

async function test() {
    process.env.DEBUG = "1";
    // Using the URL the frontend would have selected
    const shBuffer = await downloadBSEPDF('https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250220-33&attachedId=ca6b986e-82de-4fb1-b4ec-acb927ac0e59');
    const data = await pdf(shBuffer);
    console.log("TEXT START:");
    console.log(data.text);
    console.log("TEXT END.");
    
    // Now pass to universal parser
    const scraper = require('./circular-scraper');
    const res = await scraper.parseLockInData(shBuffer, 'BSE');
    console.log("PARSED:", JSON.stringify(res, null, 2));
}
test();
