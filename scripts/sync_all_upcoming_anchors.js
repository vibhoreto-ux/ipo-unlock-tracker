const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const fitz = require('child_process');

async function syncUpcomingAnchors() {
    console.log('=== Syncing Anchor PDFs & Investors for all Upcoming IPOs ===\n');
    
    const unlockPath = path.join(__dirname, '..', 'data', 'unlock-data.json');
    const ipoCachePath = path.join(__dirname, '..', 'data', 'ipopremium-cache.json');
    
    const unlockDb = JSON.parse(fs.readFileSync(unlockPath, 'utf8'));
    let ipoCache = fs.existsSync(ipoCachePath) ? JSON.parse(fs.readFileSync(ipoCachePath, 'utf8')) : { companies: {} };
    if (!ipoCache.companies) ipoCache.companies = {};
    
    const now = new Date();
    const upcoming = unlockDb.companies.filter(c => {
        if (!c.listingDate) return false;
        try {
            return new Date(c.listingDate) > now;
        } catch (e) {
            return false;
        }
    });
    
    console.log(`Found ${upcoming.length} upcoming IPOs in DB.`);
    
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    // First, scrape homepage index if needed
    console.log('Fetching ipopremium homepage for latest URLs...');
    try {
        await page.goto('https://www.ipopremium.in/', { waitUntil: 'networkidle2', timeout: 30000 });
        const domLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => ({
                href: a.getAttribute('href') || a.href || '',
                text: a.textContent.trim(),
            })).filter(l => l.href.includes('/view/ipo/') && l.text.length > 0);
        });
        
        for (const { href, text } of domLinks) {
            let name = text.replace(/\s*\((?:NSE\s*SME|BSE\s*SME|MAINBOARD|Mainboard|SME)\)\s*/gi, '').trim();
            name = name.replace(/\s+IPO\s*$/i, '').trim();
            if (!name) continue;
            const fullUrl = href.startsWith('http') ? href : `https://www.ipopremium.in${href}`;
            const cleanKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!ipoCache.companies[cleanKey]) {
                ipoCache.companies[cleanKey] = { name, detailUrl: fullUrl };
            } else {
                ipoCache.companies[cleanKey].detailUrl = fullUrl;
            }
        }
    } catch (e) {
        console.error('Homepage fetch error:', e.message);
    }
    
    // Process each upcoming company
    for (let i = 0; i < upcoming.length; i++) {
        const c = upcoming[i];
        const cname = c.companyName;
        const cleanKey = cname.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Find matching entry in ipoCache
        let cacheEntry = ipoCache.companies[cleanKey];
        if (!cacheEntry) {
            for (const [k, v] of Object.entries(ipoCache.companies)) {
                if (cleanKey.includes(k) || k.includes(cleanKey) || (cleanKey.length >= 6 && k.length >= 6 && (cleanKey.startsWith(k.slice(0,6)) || k.startsWith(cleanKey.slice(0,6))))) {
                    cacheEntry = v;
                    break;
                }
            }
        }
        
        console.log(`\n[${i+1}/${upcoming.length}] Checking "${cname}" (Detail URL: ${cacheEntry ? cacheEntry.detailUrl : 'Not found'})`);
        
        if (!cacheEntry || !cacheEntry.detailUrl) continue;
        
        try {
            await page.goto(cacheEntry.detailUrl, { waitUntil: 'networkidle2', timeout: 35000 });
            const pageData = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a')).map(a => ({
                    text: a.textContent.trim().toLowerCase(),
                    href: a.href || ''
                }));
                let anchorPdf = null;
                let capPdf = null;
                let rhpPdf = null;
                
                for (const l of links) {
                    if (l.text.includes('anchor') || l.href.includes('anchor')) {
                        if (l.href.endsWith('.pdf')) anchorPdf = l.href;
                    }
                    if (l.text.includes('capital structure') || l.href.includes('capital_structure')) {
                        if (l.href.endsWith('.pdf')) capPdf = l.href;
                    }
                    if (l.text.includes('rhp') || l.href.includes('rhp')) {
                        if (l.href.endsWith('.pdf')) rhpPdf = l.href;
                    }
                }
                return { anchorPdf, capPdf, rhpPdf };
            });
            
            if (pageData.anchorPdf) {
                console.log(`  🔥 Found Anchor PDF: ${pageData.anchorPdf}`);
                c.anchorUrl = pageData.anchorPdf;
                cacheEntry.anchorPdfUrl = pageData.anchorPdf;
            }
            if (pageData.capPdf) {
                c.capitalStructureUrl = pageData.capPdf;
                cacheEntry.capitalStructureUrl = pageData.capPdf;
            }
            if (pageData.rhpPdf && !c.rhpUrl) {
                c.rhpUrl = pageData.rhpPdf;
                cacheEntry.rhpUrl = pageData.rhpPdf;
            }
            
        } catch (e) {
            console.error(`  Error scraping detail page for ${cname}:`, e.message);
        }
    }
    
    await browser.close();
    
    fs.writeFileSync(unlockPath, JSON.stringify(unlockDb, null, 2), 'utf8');
    fs.writeFileSync(ipoCachePath, JSON.stringify(ipoCache, null, 2), 'utf8');
    console.log('\nSaved updated URLs to unlock-data.json and ipopremium-cache.json');
}

if (require.main === module) {
    syncUpcomingAnchors().catch(console.error);
}

module.exports = { syncUpcomingAnchors };
