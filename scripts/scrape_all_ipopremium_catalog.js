const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'capital-structure-cache.json');

function normalizeCompanyName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/\b(limited|ltd|pvt|private|ipo|india)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

async function scrapeAllIpoPremium() {
    console.log('--- Scraping entire IPO Premium Catalog ---');
    let cache = {};
    if (fs.existsSync(CACHE_FILE)) {
        try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')); } catch (e) {}
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    // Scrape homepage first to collect all active IDs
    let allIpos = [];
    page.on('response', async res => {
        if (res.url().includes('/ipo') && res.request().method() === 'POST') {
            try {
                const json = await res.json();
                if (json && Array.isArray(json.data)) {
                    allIpos.push(...json.data);
                }
            } catch (e) {}
        }
    });

    await page.goto('https://www.ipopremium.in/', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log(`Captured ${allIpos.length} IPOs from homepage API`);

    // Add all discovered items to cache
    for (const item of allIpos) {
        if (!item.id || !item.slug) continue;
        let rawName = item.slug.replace(/-/g, ' ');
        if (item.name) {
            const match = item.name.match(/>([^<]+)</);
            if (match) rawName = match[1];
        }
        const cleanName = rawName.replace(/\s*\([^)]*\)/g, '').trim();
        const normKey = normalizeCompanyName(cleanName);

        if (!cache[normKey]) {
            cache[normKey] = {
                companyName: cleanName,
                id: item.id,
                slug: item.slug,
                detailUrl: `https://www.ipopremium.in/view/ipo/${item.id}/${item.slug}`,
                capitalStructureUrl: null,
                anchorPdfUrl: null,
                updatedAt: new Date().toISOString()
            };
        }
    }

    // Now scan detail pages for any items missing capitalStructureUrl
    const keys = Object.keys(cache);
    console.log(`Checking ${keys.length} cached companies for Capital Structure PDFs...`);

    for (let i = 0; i < keys.length; i++) {
        const entry = cache[keys[i]];
        if (entry.capitalStructureUrl) continue;

        console.log(`[${i+1}/${keys.length}] Scraping detail page for ${entry.companyName} (${entry.detailUrl})...`);
        try {
            await page.goto(entry.detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            const result = await page.evaluate(() => {
                let cs = null;
                let an = null;
                for (const a of document.querySelectorAll('a')) {
                    const h = a.href || '';
                    const t = (a.innerText || '').toLowerCase();
                    if (!cs && (h.includes('capital_structure') || t.includes('capital structure')) && h.includes('.pdf')) {
                        cs = h;
                    }
                    if (!an && (h.includes('anchor') || t.includes('anchor')) && h.includes('.pdf')) {
                        an = h;
                    }
                }
                return { cs, an };
            });

            if (result.cs) {
                entry.capitalStructureUrl = result.cs;
                console.log(`  -> Found Capital Structure: ${result.cs}`);
            }
            if (result.an) {
                entry.anchorPdfUrl = result.an;
            }
            entry.updatedAt = new Date().toISOString();
        } catch (e) {
            console.log(`  -> Scrape failed for ${entry.companyName}: ${e.message}`);
        }
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log('Saved updated cache to', CACHE_FILE);

    await browser.close();
}

scrapeAllIpoPremium().catch(e => console.error(e));
