const fs = require('fs');
const path = require('path');
const { scrapeDetailPage, extractFromCapitalStructure, scrapeHomepageIndex } = require('../capital-structure-scraper');

function normalizeClean(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, ' ')
        .replace(/\b(ltd|limited|co|company|corp|corporation|india|pvt|private|enterprises|industries)\b/gi, ' ')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function matchesCompany(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const a = normalizeClean(nameA);
    const b = normalizeClean(nameB);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 5 && b.length >= 5) {
        if (a.includes(b) || b.includes(a)) return true;
    }
    return false;
}

async function syncAllCapitalStructures(options = {}) {
    const { forceHomepage = false, extractPreIpo = false, scrapeDetails = false } = options;
    console.log('=== Starting Enhanced IPO Premium Capital Structure Sync ===');
    
    const csCachePath = path.join(__dirname, '..', 'data', 'capital-structure-cache.json');
    const ipoCachePath = path.join(__dirname, '..', 'data', 'ipopremium-cache.json');
    const unlockPath = path.join(__dirname, '..', 'data', 'unlock-data.json');

    const csCache = fs.existsSync(csCachePath) ? JSON.parse(fs.readFileSync(csCachePath, 'utf8')) : {};
    let ipoCache = fs.existsSync(ipoCachePath) ? JSON.parse(fs.readFileSync(ipoCachePath, 'utf8')) : { companies: {} };
    if (!ipoCache.companies) ipoCache.companies = {};
    const unlockDb = JSON.parse(fs.readFileSync(unlockPath, 'utf8'));

    // Step 1: Check homepage if forceHomepage or if cache hasn't been updated recently (only when scrapeDetails is true)
    const shouldCheckHomepage = forceHomepage || !ipoCache.lastUpdated || (Date.now() - new Date(ipoCache.lastUpdated).getTime() > 6 * 60 * 60 * 1000);
    if (shouldCheckHomepage && scrapeDetails) {
        try {
            console.log('[Sync] Checking IPO Premium homepage index...');
            const freshCache = await scrapeHomepageIndex();
            if (freshCache && freshCache.companies) {
                ipoCache = freshCache;
            }
        } catch (e) {
            console.warn('[Sync] Could not scrape homepage index:', e.message);
        }
    }

    // Step 2: Merge any items from ipoCache into csCache
    for (const [key, item] of Object.entries(ipoCache.companies || {})) {
        if (!csCache[key]) {
            csCache[key] = {
                companyName: item.name || key,
                id: item.id,
                slug: item.slug,
                detailUrl: item.detailUrl,
                capitalStructureUrl: item.capitalStructureUrl || null,
                anchorPdfUrl: item.anchorPdfUrl || null,
                rhpUrl: item.rhpUrl || null,
                updatedAt: new Date().toISOString()
            };
        } else {
            if (!csCache[key].detailUrl && item.detailUrl) csCache[key].detailUrl = item.detailUrl;
            if (!csCache[key].capitalStructureUrl && item.capitalStructureUrl) csCache[key].capitalStructureUrl = item.capitalStructureUrl;
            if (!csCache[key].anchorPdfUrl && item.anchorPdfUrl) csCache[key].anchorPdfUrl = item.anchorPdfUrl;
            if (!csCache[key].rhpUrl && item.rhpUrl) csCache[key].rhpUrl = item.rhpUrl;
        }
    }

    // Step 3: Find items that need detail page scraping (if scrapeDetails is true)
    let newFoundCount = 0;
    if (scrapeDetails) {
        const entries = Object.entries(csCache);
        const ONE_DAY = 24 * 60 * 60 * 1000;
        const needScraping = entries.filter(([, v]) => {
            if (!v.detailUrl) return false;
            if (v.capitalStructureUrl) return false;
            if (v.lastScrapedAt && (Date.now() - v.lastScrapedAt < ONE_DAY)) return false;
            return true;
        });

        console.log(`[Sync] ${needScraping.length} IPOs in cache missing Capital Structure. Scanning detail pages...`);

        for (const [key, item] of needScraping) {
            try {
                console.log(`[Sync] Scraping detail page for: ${item.companyName || key} (${item.detailUrl})`);
                item.lastScrapedAt = Date.now();
                const res = await scrapeDetailPage(item.detailUrl);
                let changed = false;

                if (res && res.capitalStructureUrl && res.capitalStructureUrl !== item.capitalStructureUrl) {
                    item.capitalStructureUrl = res.capitalStructureUrl;
                    changed = true;
                    newFoundCount++;
                    console.log(`  🔥 Found Capital Structure: ${res.capitalStructureUrl}`);
                }
                if (res && res.anchorPdfUrl && res.anchorPdfUrl !== item.anchorPdfUrl) {
                    item.anchorPdfUrl = res.anchorPdfUrl;
                    changed = true;
                    console.log(`  ⚓ Found Anchor PDF: ${res.anchorPdfUrl}`);
                }
                if (res && res.rhpUrl && res.rhpUrl !== item.rhpUrl) {
                    item.rhpUrl = res.rhpUrl;
                    changed = true;
                    console.log(`  📄 Found RHP PDF: ${res.rhpUrl}`);
                }

                item.updatedAt = new Date().toISOString();
                csCache[key] = item;
                if (ipoCache.companies[key]) {
                    Object.assign(ipoCache.companies[key], item);
                }

                await new Promise(r => setTimeout(r, 600));
            } catch (e) {
                console.warn(`[Sync] Error scraping ${key}: ${e.message}`);
            }
        }
    }

    // Step 4: Sync all capital structure links, RHPs, and anchors into unlockDb
    console.log('[Sync] Syncing documents and pre-IPO data into unlock-data.json...');
    let dbUpdatedCount = 0;

    for (const [key, item] of Object.entries(csCache)) {
        if (!item.capitalStructureUrl && !item.rhpUrl && !item.anchorPdfUrl) continue;

        const candidateName = item.companyName || key;
        let match = unlockDb.companies.find(c => matchesCompany(c.companyName, candidateName));

        // If company does not exist in unlockDb at all, add it as a new upcoming company!
        if (!match) {
            console.log(`[Sync] 🆕 Discovered new upcoming company not in DB: "${candidateName}"`);
            match = {
                companyName: candidateName.includes('Ltd') ? candidateName : `${candidateName} Ltd.`,
                issueType: item.slug && item.slug.includes('sme') ? 'SME' : 'Mainboard',
                exchange: 'BSE, NSE',
                allotmentDate: null,
                chittorgarhUrl: null,
                issuePrice: null,
                anchor30: null,
                anchor90: null,
                preIPO: null,
                anchorInvestors: [],
                anchorShares: 0,
                totalShares: 0,
                rhpUrl: item.rhpUrl || null,
                capitalStructureUrl: item.capitalStructureUrl || null,
                anchorUrl: item.anchorPdfUrl || null,
                preIpoInvestors: []
            };
            unlockDb.companies.unshift(match);
            dbUpdatedCount++;
        }

        let docChanged = false;
        if (item.capitalStructureUrl && match.capitalStructureUrl !== item.capitalStructureUrl) {
            match.capitalStructureUrl = item.capitalStructureUrl;
            docChanged = true;
            console.log(`  🔗 Updated Capital Structure for "${match.companyName}": ${item.capitalStructureUrl}`);
        }
        if (item.anchorPdfUrl && !match.anchorUrl) {
            match.anchorUrl = item.anchorPdfUrl;
            docChanged = true;
        }
        if (item.rhpUrl && (!match.rhpUrl || match.rhpUrl.includes('bseindia'))) {
            match.rhpUrl = item.rhpUrl;
            docChanged = true;
        }

        // Step 5: Extract Pre-IPO investors if missing and CS URL exists
        if (extractPreIpo && match.capitalStructureUrl && match.capitalStructureUrl.toLowerCase().includes('capital_structure')) {
            const hasPreIpo = Array.isArray(match.preIpoInvestors) && match.preIpoInvestors.length > 0;
            if (!hasPreIpo && !match.preIpoChecked) {
                match.preIpoChecked = true;
                docChanged = true;
                console.log(`[Sync] Extracting pre-IPO investors for "${match.companyName}"...`);
                try {
                    const extRes = await extractFromCapitalStructure(match.companyName, match.capitalStructureUrl);
                    if (extRes && Array.isArray(extRes.preIpoInvestors) && extRes.preIpoInvestors.length > 0) {
                        match.preIpoInvestors = extRes.preIpoInvestors;
                        if (extRes.waca) match.preIpoWaca = extRes.waca;
                        if (extRes.peerComparison) match.peerComparison = extRes.peerComparison;
                        console.log(`  ✅ Extracted ${extRes.preIpoInvestors.length} pre-IPO investors for "${match.companyName}" (WACA: ${extRes.waca})`);
                    }
                } catch (err) {
                    console.warn(`  Extraction error for "${match.companyName}": ${err.message}`);
                }
            }
        }

        if (docChanged) dbUpdatedCount++;
    }

    // Step 6: Persist everything to disk
    const nowIso = new Date().toISOString();
    unlockDb.lastUpdated = nowIso;
    fs.writeFileSync(unlockPath, JSON.stringify(unlockDb, null, 2), 'utf8');
    fs.writeFileSync(csCachePath, JSON.stringify(csCache, null, 2), 'utf8');
    fs.writeFileSync(ipoCachePath, JSON.stringify(ipoCache, null, 2), 'utf8');

    console.log(`\n=== Sync Complete! Newly found CS PDFs: ${newFoundCount}, DB records updated/added: ${dbUpdatedCount} ===`);
    return {
        newFoundCount,
        dbUpdatedCount,
        totalCompanies: unlockDb.companies.length
    };
}

if (require.main === module) {
    syncAllCapitalStructures({ forceHomepage: false, extractPreIpo: true })
        .catch(e => console.error(e));
}

module.exports = { syncAllCapitalStructures, normalizeClean, matchesCompany };
