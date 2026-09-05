/**
 * scripts/enrich_anchors.js
 * 
 * Enriches companies with anchor investors from Chittorgarh subscription pages.
 */

const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'unlock-data.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const { fetchAnchorInvestorNames } = require('../browser-scraper');

async function enrichAnchors(limit = 40) {
    const targets = db.companies.filter(c => {
        const hasAnchorDates = c.anchor30?.original || c.anchor90?.original;
        const noInvestors = !c.anchorInvestors || c.anchorInvestors.length === 0 || typeof c.anchorInvestors[0] === 'string';
        return hasAnchorDates && noInvestors && c.chittorgarhUrl;
    });

    console.log(`Total companies needing anchor enrichment: ${targets.length}`);
    const batch = targets.slice(-limit);
    console.log(`Enriching recent batch of ${batch.length} companies...`);

    let updated = 0;
    for (const c of batch) {
        try {
            const parsed = await fetchAnchorInvestorNames(c.chittorgarhUrl);
            if (parsed && Array.isArray(parsed.investors) && parsed.investors.length > 0) {
                c.anchorInvestors = parsed.investors;
                if (parsed.anchorShares > 0) c.anchorShares = parsed.anchorShares;
                if (parsed.totalShares > 0 && !c.totalShares) c.totalShares = parsed.totalShares;
                updated++;
                console.log(`[+] ${c.companyName}: ${parsed.investors.length} anchors (${parsed.anchorShares} shares)`);
            }
            // Small pause to be gentle
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            console.warn(`[-] Error for ${c.companyName}: ${e.message}`);
        }
    }

    console.log(`Enrichment complete: updated ${updated} companies.`);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

const limitArg = parseInt(process.argv[2], 10) || 40;
enrichAnchors(limitArg).catch(e => console.error(e));
