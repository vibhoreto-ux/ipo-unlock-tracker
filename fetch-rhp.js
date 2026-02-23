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

    // Fallback if URL is relative
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
                // Ensure absolute URL
                if (href) {
                    rhpLink = href.startsWith('http') ? href : `https://www.chittorgarh.com${href}`;
                }
            }
        });

        return rhpLink;
    } catch (e) {
        console.error(`Error fetching RHP for ${company.companyName}:`, e.message);
        return null;
    }
}

async function runBackfill() {
    console.log("Starting RHP Backfill for all companies in DB...");
    const db = readDB();
    const companies = db.companies;

    let processedCount = 0;
    let successCount = 0;

    // Process in batches of 10 to avoid overwhelming the server
    const BATCH_SIZE = 10;

    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
        const batch = companies.slice(i, i + BATCH_SIZE);

        const promises = batch.map(async (company) => {
            if (company.rhpUrl) return; // already have it
            if (!company.chittorgarhUrl) return; // cannot fetch

            const link = await fetchRHPForCompany(company);
            if (link) {
                company.rhpUrl = link;
                successCount++;
            }
            processedCount++;
        });

        await Promise.all(promises);
        console.log(`Processed ${i + batch.length} / ${companies.length} companies... (Found ${successCount} RHP links)`);

        // Small delay between batches to be polite
        await new Promise(r => setTimeout(r, 500));

        // Output incremental saves to prevent data loss on crash
        writeDB(db);
    }

    console.log(`\nBackfill complete! Found ${successCount} new RHP links out of ${processedCount} checked.`);
}

runBackfill();
