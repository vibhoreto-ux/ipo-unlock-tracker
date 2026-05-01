const axios = require('axios');
const cheerio = require('cheerio');

async function testFetchTipco() {
    const url = 'https://webnodejs.chittorgarh.com/cloud/report/data-read/82/1/2/2026/2025-26/0/all/0?search=&v=11-35';
    try {
        const resp = await axios.get(url, { headers: { 'User-Agent': 'Node/14' }, timeout: 15000 });
        const records = resp.data.reportTableData || [];
        const tipco = records.find(r => r.Company.includes('Tipco'));
        
        if (!tipco) {
            console.log("Tipco not found!");
            return;
        }
        
        const issuePriceStr = tipco['Issue Price (Rs.)'] || '';
        console.log("Raw Issue Price String:", issuePriceStr);
        
        let issuePrice = null;
        if (issuePriceStr) {
            const matches = issuePriceStr.match(/(\d+\.?\d*)/g);
            console.log("Regex Matches:", matches);
            if (matches && matches.length > 0) {
                issuePrice = parseFloat(matches[matches.length - 1]);
            }
        }
        console.log("Final Parsed issuePrice:", issuePrice);
        
    } catch(e) {
        console.error(e);
    }
}
testFetchTipco();
