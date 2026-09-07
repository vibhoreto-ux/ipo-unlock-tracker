const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function findAllDocs() {
    console.log('=== Checking all 50 IPO Premium IPOs for Documents ===');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36');

    // 1. Get all detail links from homepage
    await page.goto('https://www.ipopremium.in/', { waitUntil: 'networkidle2', timeout: 45000 });
    const ipos = await page.evaluate(() => {
        const list = [];
        const seen = new Set();
        document.querySelectorAll('a[href*="/view/ipo/"]').forEach(a => {
            const href = a.href;
            const name = a.innerText.trim();
            if (href && !seen.has(href)) {
                seen.add(href);
                list.push({ name, href });
            }
        });
        return list;
    });

    console.log(`Found ${ipos.length} total detail URLs. Scanning sequentially...`);

    const results = [];
    const csCachePath = path.join(__dirname, '..', 'data', 'capital-structure-cache.json');
    const ipoCachePath = path.join(__dirname, '..', 'data', 'ipopremium-cache.json');
    const csCache = fs.existsSync(csCachePath) ? JSON.parse(fs.readFileSync(csCachePath, 'utf8')) : {};
    const ipoCache = fs.existsSync(ipoCachePath) ? JSON.parse(fs.readFileSync(ipoCachePath, 'utf8')) : { companies: {} };

    for (let i = 0; i < ipos.length; i++) {
        const item = ipos[i];
        const m = item.href.match(/\/view\/ipo\/(\d+)\/([^\/]+)/);
        const slug = m ? m[2] : item.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const key = slug.replace(/[^a-z0-9]/g, '');

        try {
            await page.goto(item.href, { waitUntil: 'networkidle2', timeout: 25000 });
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(r => setTimeout(r, 600));

            const docs = await page.evaluate(() => {
                let cs = null, anchor = null, rhp = null;
                const links = Array.from(document.querySelectorAll('a'));
                for (const a of links) {
                    const href = a.href || '';
                    const text = (a.innerText || '').toLowerCase();
                    if (href.includes('.pdf')) {
                        if ((href.includes('capital_structure') || text.includes('capital structure')) && !cs) cs = href;
                        if ((href.includes('anchor') || text.includes('anchor')) && !anchor) anchor = href;
                        if ((href.includes('rhp') || href.includes('prospectus') || text.includes('rhp') || text.includes('dhrp')) && !rhp) rhp = href;
                    }
                }
                return { cs, anchor, rhp };
            });

            const entry = {
                name: item.name,
                slug,
                url: item.href,
                capitalStructureUrl: docs.cs,
                anchorPdfUrl: docs.anchor,
                rhpUrl: docs.rhp
            };

            results.push(entry);

            if (docs.cs || docs.anchor || docs.rhp) {
                console.log(`[${i + 1}/${ipos.length}] ${item.name}:`);
                if (docs.cs) console.log(`  🔥 CS: ${docs.cs}`);
                if (docs.anchor) console.log(`  ⚓ Anchor: ${docs.anchor}`);
                if (docs.rhp) console.log(`  📄 RHP: ${docs.rhp}`);

                // Update cache immediately
                if (!csCache[key]) csCache[key] = { companyName: item.name, slug, detailUrl: item.href };
                if (docs.cs) csCache[key].capitalStructureUrl = docs.cs;
                if (docs.anchor) csCache[key].anchorPdfUrl = docs.anchor;
                if (docs.rhp) csCache[key].rhpUrl = docs.rhp;
                csCache[key].updatedAt = new Date().toISOString();

                ipoCache.companies[key] = { ...csCache[key] };
            } else {
                console.log(`[${i + 1}/${ipos.length}] ${item.name}: (No PDFs uploaded on IPO Premium)`);
            }

        } catch (e) {
            console.log(`[${i + 1}/${ipos.length}] Error on ${item.name}: ${e.message}`);
        }
    }

    await browser.close();

    fs.writeFileSync(csCachePath, JSON.stringify(csCache, null, 2), 'utf8');
    fs.writeFileSync(ipoCachePath, JSON.stringify(ipoCache, null, 2), 'utf8');
    fs.writeFileSync('/tmp/all_ipopremium_scanned.json', JSON.stringify(results, null, 2), 'utf8');

    const totalWithCs = results.filter(r => r.capitalStructureUrl);
    console.log(`\n=== Scan Complete! Found ${totalWithCs.length} total Capital Structure PDFs across 50 IPOs ===`);
}

findAllDocs().catch(e => console.error(e));
