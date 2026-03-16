const { downloadBSEPDF } = require('./circular-scraper');
const pdf = require('pdf-parse');

async function test() {
    const shBuffer = await downloadBSEPDF('https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250220-33&attachedId=491341c3-7260-4081-bda9-1707b83576a0');
    const data = await pdf(shBuffer);
    console.log("SHANMUGA RAW TEXT:");
    console.log(data.text);
}
test();
