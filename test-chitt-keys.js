const axios = require('axios');

async function testApi() {
    const year = 2025;
    const yearRange = `${year - 1}-${String(year).slice(2)}`;
    const url = `https://webnodejs.chittorgarh.com/cloud/report/data-read/13/1/2/${year}/${yearRange}/0/all/0?search=&v=11-35`;

    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    try {
        const resp = await axios.get(url, { headers });
        const records = resp.data.reportTableData || [];
        if (records.length > 0) {
            console.log("Keys available in Chittorgarh API record:");
            console.log(Object.keys(records[0]));
            console.log("\nSample Data:");
            console.log(records[0]);
        } else {
            console.log("No records found.");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testApi();
