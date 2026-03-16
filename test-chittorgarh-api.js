const axios = require('axios');
async function test() {
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Referer': 'https://www.chittorgarh.com/',
        'Origin': 'https://www.chittorgarh.com',
        'Accept': 'application/json',
    };
    const url = 'https://webnodejs.chittorgarh.com/cloud/report/data-read/82/1/2/2025/2024-25/0/all/0?search=&v=11-35';
    const res = await axios.get(url, { headers: HEADERS });
    console.log("First record keys:", Object.keys(res.data.reportTableData[0]));
    console.log("First record data:", res.data.reportTableData[0]);
}
test();
