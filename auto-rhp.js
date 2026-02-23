const { readDB, writeDB } = require('./db');
const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'Referer': 'https://www.chittorgarh.com/',
    'Origin': 'https://www.chittorgarh.com',
};

async function fetchRHPForCompany(company) {
    if (!company.chittorgarhUrl) return null;
    const targetUrl = company.chittorgarhUrl.startsWith('http') 
        ? company.chittorgarhUrl 
        : `https://www.chittorgarh.com${company.chittorgarhUrl}`;

    try {
        const res = await axios.get(targetUrl, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);
        let rhpLink = null;
        
        $('a').each((i, el) => {
            const txt = $(el).text().toLowerCase();
            const href = $(el).attr('href');
            if (txt.includes('rhp') || (href && href.toLowerCase().includes('rhp'))) {
                if (href) rhpLink = href.startsWith('http') ? href : `https://www.chittorgarh.com${href}`;
            }
        });
        return rhpLink;
    } catch (e) {
        return null;
    }
}

async function autoFetchMissingRHP() {
    const db = readDB();
    const missing = db.companies.filter(c => c.chittorgarhUrl && !c.rhpUrl);
    if (missing.length === 0) return;
    
    console.log(`[Auto-RHP] Found ${missing.length} companies missing RHP links. Fetching in background...`);
    
    let updated = 0;
    // Process top 10 at a time
    for (const company of missing.slice(0, 10)) {
        const link = await fetchRHPForCompany(company);
        if (link) {
            company.rhpUrl = link;
            updated++;
        }
        await new Promise(r => setTimeout(r, 500));
    }
    
    if (updated > 0) {
        writeDB(db);
        console.log(`[Auto-RHP] Saved ${updated} new RHP links to database.`);
    }
}

module.exports = { autoFetchMissingRHP };
