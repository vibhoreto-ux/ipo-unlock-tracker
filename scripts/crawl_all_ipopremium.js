const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { extractFromCapitalStructure } = require('../capital-structure-scraper');

async function crawlAndSyncIpoPremium() {
    console.log('=== Starting Complete IPO Premium Catalog Scraper & Sync ===');
    const csCachePath = path.join(__dirname, '..', 'data', 'capital-structure-cache.json');
    const ipoCachePath = path.join(__dirname, '..', 'data', 'ipopremium-cache.json');
    const unlockPath = path.join(__dirname, '..', 'data', 'unlock-data.json');

    const csCache = fs.existsSync(csCachePath) ? JSON.parse(fs.readFileSync(csCachePath, 'utf8')) : {};
    const ipoCache = fs.existsSync(ipoCachePath) ? JSON.parse(fs.readFileSync(ipoCachePath, 'utf8')) : { lastUpdated: null, companies: {} };
    if (!ipoCache.companies) ipoCache.companies = {};
    const unlockDb = JSON.parse(fs.readFileSync(unlockPath, 'utf8'));

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const mainPage = await browser.newPage();
    await mainPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    console.log('1. Fetching all IPOs from https://www.ipopremium.in/ ...');
    await mainPage.goto('https://www.ipopremium.in/', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));

    const ipos = await mainPage.evaluate(() => {
        const links = [];
        const seen = new Set();
        document.querySelectorAll('a[href*="/view/ipo/"]').forEach(a => {
            const href = a.href;
            const text = a.innerText.trim();
            if (href && !seen.has(href)) {
                seen.add(href);
                links.push({ text, href });
            }
        });
        return links;
    });
    await mainPage.close();

    console.log(`Found ${ipos.length} IPOs on IPO Premium. Processing detail pages...`);

    const CONCURRENCY = 4;
    const queue = [...ipos];
    let completed = 0;
    let foundCs = 0;
    const crawledData = [];

    async function worker(workerId) {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

        while (queue.length > 0) {
            const item = queue.shift();
            if (!item) break;

            const m = item.href.match(/\/view\/ipo\/(\d+)\/([^\/]+)/);
            const id = m ? parseInt(m[1], 10) : null;
            const slug = m ? m[2] : item.text.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const key = slug.replace(/[^a-z0-9]/g, '');

            try {
                await page.goto(item.href, { waitUntil: 'networkidle2', timeout: 35000 });
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 1200));

                const docData = await page.evaluate(() => {
                    let capitalStructureUrl = null;
                    let anchorPdfUrl = null;
                    let rhpUrl = null;

                    const allLinks = Array.from(document.querySelectorAll('a'));
                    for (const a of allLinks) {
                        const href = a.href || '';
                        const text = (a.textContent || '').trim().toLowerCase();

                        if (!capitalStructureUrl && (href.includes('capital_structure') || text.includes('capital structure')) && href.includes('.pdf')) {
                            capitalStructureUrl = href;
                        }
                        if (!anchorPdfUrl && (href.includes('anchor') || text.includes('anchor')) && href.includes('.pdf')) {
                            anchorPdfUrl = href;
                        }
                        if (!rhpUrl && (href.includes('rhp') || href.includes('prospectus') || text.includes('rhp') || text.includes('drhp') || text.includes('dhrp')) && href.includes('.pdf')) {
                            rhpUrl = href;
                        }
                    }

                    // Fallback search in body HTML
                    const html = document.body.innerHTML;
                    const pdfMatches = html.match(/https?:\/\/[^"'\s<>]+\.pdf/g) || [];
                    for (const p of pdfMatches) {
                        if (p.includes('capital_structure') && !capitalStructureUrl) capitalStructureUrl = p;
                        if (p.includes('anchor') && !anchorPdfUrl) anchorPdfUrl = p;
                        if ((p.includes('rhp') || p.includes('prospectus')) && !rhpUrl) rhpUrl = p;
                    }

                    // Also extract issue details from page tables if available
                    let issuePrice = null;
                    let issueType = 'Mainboard';
                    let dates = null;

                    const textContent = document.body.innerText;
                    if (textContent.includes('BSE SME') || textContent.includes('SME')) {
                        issueType = textContent.includes('BSE SME') ? 'BSE SME' : (textContent.includes('NSE SME') ? 'NSE SME' : 'SME');
                    }

                    const priceMatch = textContent.match(/(?:Issue|Offer)\s*Price\s*[:\t]?\s*₹?\s*(\d+(?:\.\d+)?)/i) ||
                                       textContent.match(/Price\s*Band\s*[:\t]?\s*₹?\s*\d+\s*(?:to|-)\s*₹?\s*(\d+(?:\.\d+)?)/i);
                    if (priceMatch && !textContent.includes('TENTATIVE') && !textContent.includes('Tentative')) {
                        issuePrice = parseFloat(priceMatch[1]);
                    }

                    return { capitalStructureUrl, anchorPdfUrl, rhpUrl, issuePrice, issueType };
                });

                if (docData.capitalStructureUrl) foundCs++;
                completed++;

                const entry = {
                    companyName: item.text.replace(/\s*\((?:NSE\s*SME|BSE\s*SME|MAINBOARD|Mainboard|SME)\)\s*/gi, '').trim(),
                    id,
                    slug,
                    detailUrl: item.href,
                    capitalStructureUrl: docData.capitalStructureUrl,
                    anchorPdfUrl: docData.anchorPdfUrl,
                    rhpUrl: docData.rhpUrl,
                    issuePrice: docData.issuePrice,
                    issueType: docData.issueType,
                    updatedAt: new Date().toISOString()
                };

                csCache[key] = entry;
                ipoCache.companies[key] = entry;
                crawledData.push(entry);

                console.log(`[${completed}/${ipos.length}] ${entry.companyName} => CS: ${entry.capitalStructureUrl ? 'FOUND' : 'null'} | Anchor: ${entry.anchorPdfUrl ? 'FOUND' : 'null'} | RHP: ${entry.rhpUrl ? 'FOUND' : 'null'}`);

            } catch (err) {
                console.warn(`  [Worker ${workerId}] Error crawling ${item.text}: ${err.message}`);
            }
        }
        await page.close();
    }

    const workers = [];
    for (let w = 0; w < CONCURRENCY; w++) workers.push(worker(w));
    await Promise.all(workers);

    await browser.close();

    // Save caches
    fs.writeFileSync(csCachePath, JSON.stringify(csCache, null, 2), 'utf8');
    ipoCache.lastUpdated = new Date().toISOString();
    fs.writeFileSync(ipoCachePath, JSON.stringify(ipoCache, null, 2), 'utf8');
    console.log(`\nSaved updated caches with ${foundCs} Capital Structure PDFs!`);

    // Synchronize unlock-data.json
    console.log('\n2. Synchronizing database (data/unlock-data.json)...');
    let updatedDbCount = 0;
    let addedCount = 0;

    for (const item of crawledData) {
        const norm = item.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normSlug = (item.slug || '').replace(/[^a-z0-9]/g, '');

        let match = unlockDb.companies.find(c => {
            const cn = (c.companyName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return cn === norm || cn === normSlug || (cn.length > 7 && (cn.startsWith(norm) || norm.startsWith(cn)));
        });

        if (match) {
            let changed = false;
            if (item.capitalStructureUrl && match.capitalStructureUrl !== item.capitalStructureUrl) {
                match.capitalStructureUrl = item.capitalStructureUrl;
                changed = true;
            }
            if (item.anchorPdfUrl && !match.anchorUrl) {
                match.anchorUrl = item.anchorPdfUrl;
                changed = true;
            }
            if (item.rhpUrl && !match.rhpUrl) {
                match.rhpUrl = item.rhpUrl;
                changed = true;
            }
            if (changed) updatedDbCount++;
        } else {
            // New upcoming company from IPO Premium not yet in Chittorgarh! (e.g. Rentomojo, Vinod Texworld, Infrax Renewable, etc.)
            const newCompany = {
                companyName: item.companyName,
                issueType: item.issueType || 'Mainboard',
                exchange: item.issueType && item.issueType.includes('SME') ? (item.issueType.includes('BSE') ? 'BSE' : 'NSE') : 'BSE, NSE',
                allotmentDate: null,
                chittorgarhUrl: null,
                issuePrice: item.issuePrice || null,
                anchor30: null,
                anchor90: null,
                preIPO: null,
                anchorInvestors: [],
                anchorShares: 0,
                totalShares: 0,
                rhpUrl: item.rhpUrl,
                capitalStructureUrl: item.capitalStructureUrl,
                anchorUrl: item.anchorPdfUrl,
                preIpoInvestors: []
            };
            unlockDb.companies.unshift(newCompany);
            addedCount++;
            console.log(`+ Added new upcoming IPO from IPO Premium to DB: ${newCompany.companyName}`);
        }
    }

    unlockDb.lastUpdated = new Date().toISOString();
    fs.writeFileSync(unlockPath, JSON.stringify(unlockDb, null, 2), 'utf8');
    console.log(`\nSync Complete: ${updatedDbCount} existing companies updated with doc links, ${addedCount} new upcoming companies added!`);
}

if (require.main === module) {
    crawlAndSyncIpoPremium().catch(e => console.error(e));
}

module.exports = { crawlAndSyncIpoPremium };
