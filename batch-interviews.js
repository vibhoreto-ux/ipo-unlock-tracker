/**
 * batch-interviews.js
 * ===================
 * Runs interview-guidance.js for all upcoming IPOs and stores results in the DB.
 * Uses Chittorgarh scraping + YouTube search (no blocked transcript API).
 */

const fs = require('fs');
const path = require('path');
const { extractGuidance } = require('./interview-guidance');

const DB_PATH = path.join(__dirname, 'data', 'unlock-data.json');
let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

const today = new Date();
today.setHours(0, 0, 0, 0);

// Find upcoming companies (allotmentDate in the future, or no allotmentDate = not yet listed)
const upcoming = db.companies.filter(c => {
    const listDateStr = c.allotmentDate ? (c.allotmentDate.original || c.allotmentDate.adjusted) : null;
    if (!listDateStr) return true;
    const listDate = new Date(listDateStr);
    listDate.setHours(0, 0, 0, 0);
    return listDate > today;
});

console.log(`Processing ${upcoming.length} upcoming IPOs...`);

async function processAll() {
    for (const company of upcoming) {
        // Skip only if we already have real (non-stale) data
        const badMarkers = ['⚠️', 'blocked', 'Google News', '📰', 'transcript could not'];
        const hasRealData = Array.isArray(company.managementHighlights) &&
            company.managementHighlights.length > 0 &&
            !company.managementHighlights.some(h => badMarkers.some(m => h.includes(m)));

        if (hasRealData) {
            console.log(`Skipping ${company.companyName} (already has real data)`);
            continue;
        }

        console.log(`\nExtracting guidance for: ${company.companyName}`);

        try {
            const result = await extractGuidance(company.companyName);
            company.managementHighlights = result.highlights || [];
            if (result.sourceUrl) company.managementSourceUrl = result.sourceUrl;
            if (result.videoTitle) company.managementVideoTitle = result.videoTitle;

            console.log(`  → ${result.highlights.length} highlights found`);
            result.highlights.forEach(h => console.log(`    • ${h.substring(0, 90)}...`));
        } catch (e) {
            console.error(`  Error: ${e.message}`);
            company.managementHighlights = [];
        }
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log('\n✅ Batch guidance extraction complete.');
}

processAll().catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
