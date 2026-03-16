const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'unlock-data.json');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBSEAnnexureUrl(noticeId) {
    const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`;
    try {
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            }
        });
        const html = await resp.text();

        // Find links in HTML (handles unquoted attributes and URLs that don't end in .pdf)
        const links = [...html.matchAll(/<a[^>]+href=["']?([^\s>'"']+)[^>]*>(.*?)<\/a>/gi)];

        let annexureUrl = null;

        // Strategy 1: Look for tablebluelink class with pdf/zip
        for (const match of links) {
            const href = match[1];
            const fullTag = match[0];
            const text = match[2].toLowerCase();
            if (fullTag.toLowerCase().includes('tablebluelink')) {
                if (href.toLowerCase().includes('.pdf') || href.toLowerCase().includes('.zip') || text.includes('.pdf') || text.includes('annexure') || text.includes('notice')) {
                    if (!annexureUrl) annexureUrl = href;
                }
            }
        }

        // Strategy 2: Look for 'annexure' or 'notice' in text
        if (!annexureUrl) {
            for (const match of links) {
                const href = match[1];
                const text = match[2].toLowerCase();
                if (text.includes('annexure') || text.includes('notice') || text.includes('detail')) {
                    if (!annexureUrl) annexureUrl = href;
                }
            }
        }

        // Strategy 3: Any PDF
        if (!annexureUrl) {
            for (const match of links) {
                if (!annexureUrl) annexureUrl = match[1];
            }
        }

        if (annexureUrl) {
            if (!annexureUrl.startsWith('http')) {
                annexureUrl = 'https://www.bseindia.com' + (annexureUrl.startsWith('/') ? '' : '/') + annexureUrl;
            }
            return annexureUrl;
        }
        return null;
    } catch (err) {
        console.error(`Error fetching BSE notice ${noticeId}:`, err.message);
        return null;
    }
}

async function main() {
    if (!fs.existsSync(dbPath)) {
        console.log('No database found.');
        return;
    }
    const dbRaw = fs.readFileSync(dbPath, 'utf-8');
    const db = JSON.parse(dbRaw);
    let updated = 0;

    for (const [companyName, data] of Object.entries(db.circularData)) {
        // Fix incorrect NSE source applied to BSE-only companies
        if (data.source === 'NSE') {
            const company = db.companies.find(c => c.companyName === companyName);
            if (company && (company.exchange === 'BSE SME' || company.exchange === 'BSE')) {
                console.log(`Fixing incorrect source for ${companyName} (was NSE, should be BSE). Deleting invalid cache.`);
                delete db.circularData[companyName]; // force re-fetch
                updated++;
                continue;
            }
        }

        if (!data.pdfUrl && data.noticeId && data.source) {
            if (data.source === 'BSE' && !data.noticeId.startsWith('client-fetched')) {
                console.log(`Backfilling pdfUrl for ${companyName} (BSE)...`);
                const url = await fetchBSEAnnexureUrl(data.noticeId);
                if (url) {
                    data.pdfUrl = url;
                    console.log(` -> Found BSE PDF: ${url}`);
                    updated++;
                } else {
                    console.log(` -> No PDF found on circular page.`);
                }
                await sleep(500); // polite delay
            }
            else if (data.source === 'NSE' && data.noticeId.startsWith('NSE/CML/')) {
                const idNum = data.noticeId.split('/').pop();
                const url = `https://nsearchives.nseindia.com/content/circulars/${idNum}.zip`;
                data.pdfUrl = url;
                console.log(`Backfilling pdfUrl for ${companyName} (NSE)...`);
                console.log(` -> Assumed NSE ZIP: ${url}`);
                updated++;
            }
        }
    }

    if (updated > 0) {
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
        console.log(`Successfully backfilled records. Updated ${updated} entries.`);
    } else {
        console.log('No records needed backfilling.');
    }
}

main().catch(console.error);
