const { downloadBSEPDF } = require('./circular-scraper');
const axios = require('axios');

async function test() {
    // 1. Download the Shanmuga PDF
    console.log("Downloading PDF...");
    const shBuffer = await downloadBSEPDF('https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250220-33&attachedId=491341c3-7260-4081-bda9-1707b83576a0');
    console.log("PDF Size:", shBuffer.length);
    
    // 2. Post it to localhost API
    console.log("Posting to API...");
    try {
        const res = await axios.post(`http://localhost:3001/api/parse-bse-pdf?company=Shanmuga&noticeId=20250220-33`, shBuffer, {
            headers: { 'Content-Type': 'application/octet-stream' }
        });
        console.log("SERVER RESPONSE:", JSON.stringify(res.data, null, 2));
    } catch(e) {
        console.log("ERROR:", e.message);
    }
}
test();
