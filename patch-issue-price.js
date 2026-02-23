const axios = require('axios');
const cheerio = require('cheerio');
const { readDB, writeDB } = require('./db');

const BASE_API = 'https://webnodejs.chittorgarh.com/cloud/report/data-read';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Referer': 'https://www.chittorgarh.com/',
    'Origin': 'https://www.chittorgarh.com',
    'Accept': 'application/json',
};

async function fetchIssuePrices(year) {
    const yearRange = `${year - 1}-${String(year).slice(2)}`;
    const url = `${BASE_API}/82/1/2/${year}/${yearRange}/0/all/0?search=&v=11-35`;
    try {
        const resp = await axios.get(url, { headers: HEADERS });
        const records = resp.data.reportTableData || [];
        const prices = {};
        for (const rec of records) {
            const rawName = rec['Company'] || '';
            const $ = cheerio.load(rawName);
            let companyName = $('a').text().trim() || rawName.replace(/<[^>]+>/g, '').trim();
            companyName = companyName.replace(/\s+IPO\s*$/i, '').trim();

            const issuePriceStr = rec['Issue Price (Rs.)'] || '';
            let issuePrice = null;
            if (issuePriceStr) {
                const matches = issuePriceStr.match(/(\d+\.?\d*)/g);
                if (matches && matches.length > 0) {
                    issuePrice = parseFloat(matches[matches.length - 1]);
                }
            }
            prices[companyName] = issuePrice;
        }
        return prices;
    } catch (e) {
        console.error(`Error fetching year ${year}:`, e.message);
        return {};
    }
}

async function run() {
    const db = readDB();
    const allPrices = {};
    for (const year of [2023, 2024, 2025, 2026]) {
        console.log(`Fetching issue prices for ${year}...`);
        const prices = await fetchIssuePrices(year);
        Object.assign(allPrices, prices);
    }

    let cnt = 0;
    for (const company of db.companies) {
        if (allPrices[company.companyName] !== undefined && allPrices[company.companyName] !== null) {
            company.issuePrice = allPrices[company.companyName];
            cnt++;
            console.log(`Updated ${company.companyName} -> ₹${company.issuePrice}`);
        }
    }
    writeDB(db);
    console.log(`Successfully updated ${cnt} companies with issuePrice!`);
}

run();
