const { downloadBSEPDF } = require('./circular-scraper');

async function test() {
    process.env.DEBUG = "1";
    // Shanmuga PDF
    const shBuffer = await downloadBSEPDF('https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250220-33&attachedId=491341c3-7260-4081-bda9-1707b83576a0');
    
    // Simulating frontend post to localhost API
    const fetch = require('node-fetch');
    const res = await fetch(`http://localhost:3001/api/parse-bse-pdf?company=Shanmuga&noticeId=20250220-33`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: shBuffer
    });
    const parsed = await res.json();
    console.log("SERVER RESPONSE:", JSON.stringify(parsed, null, 2));
}
test();
