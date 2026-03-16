const scraper = require('./circular-scraper');
const { downloadBSEPDF } = require('./circular-scraper');
const pdf = require('pdf-parse');

async function test() {
    console.log("Fetching HM Electro URL...");
    // 20250130-45
    const url = 'https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250130-45&attachedId=4bb8daf7-d3c7-4479-b230-ca6bb0a783af';
    const buffer = await downloadBSEPDF(url);
    const data = await pdf(buffer);
    console.log("RAW TEXT START:");
    console.log(data.text.substring(0, 1500));
    console.log("RAW TEXT END.");
}
test();
