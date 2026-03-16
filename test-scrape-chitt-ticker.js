const axios = require('axios');
const cheerio = require('cheerio');

async function getTicker() {
    const url = 'https://www.chittorgarh.com/ipo/modern-diagnostic-ipo/2276/';
    try {
        const resp = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const $ = cheerio.load(resp.data);

        let nseCode = '';
        let bseCode = '';

        const nseRow = $('td:contains("NSE Code")').parent();
        nseRow.each((i, el) => {
            const text = $(el).text();
            if (text.includes('NSE Code')) nseCode = text.replace('NSE Code', '').trim();
        });

        const bseRow = $('td:contains("BSE Code")').parent();
        bseRow.each((i, el) => {
            const text = $(el).text();
            if (text.includes('BSE Code')) bseCode = text.replace('BSE Code', '').trim();
        });

        console.log(`NSE Code: ${nseCode}`);
        console.log(`BSE Code: ${bseCode}`);

    } catch (e) {
        console.error("Error:", e.message);
    }
}

getTicker();
