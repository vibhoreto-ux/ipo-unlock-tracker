const axios = require('axios');
const fs = require('fs');

async function run() {
    console.log("Starting Batch Pre-IPO Cacher...");

    // Load local DB
    const res = await axios.get('http://localhost:3001/api/unlock-data');
    const companies = res.data.data;
    const dbPath = './data/unlock-data.json';
    let rawDb = {};
    if (fs.existsSync(dbPath)) {
        rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }

    // Filter companies that DO NOT have an explicit "fetchedAt" stamp in their cached details
    const targetCompanies = companies.filter(c => {
        const cachedDetails = rawDb.companyDetails && rawDb.companyDetails[c.companyName];
        if (!cachedDetails) return true; // Needs fetching
        if (cachedDetails.error || cachedDetails.found === false) return true; // Previous attempt failed, retry
        if (!cachedDetails.fetchedAt) return true; // Old cached data, needs fresh fetch
        return false; // Safely cached already
    });

    console.log(`Found ${targetCompanies.length} companies needing Pre-IPO Annexure caching.`);
    console.log(`Delaying 3 seconds between requests to prevent WAF bans...\n`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < targetCompanies.length; i++) {
        const c = targetCompanies[i];
        console.log(`[${i + 1}/${targetCompanies.length}] Fetching Annexure for: ${c.companyName} (${c.exchange})`);

        try {
            const detailRes = await axios.get(`http://localhost:3001/api/unlock-details/${encodeURIComponent(c.companyName)}`, {
                timeout: 60000 // 60s timeout for curl/PDF parsing
            });

            if (detailRes.data.fromCache) {
                console.log(`  -> Valid Cache hit.`);
                skipped++;
            } else if (detailRes.data.error || detailRes.data.found === false) {
                console.log(`  -> Not Found or Error: ${detailRes.data.error || detailRes.data.message}`);
                failed++;
            } else {
                console.log(`  -> Successfully downloaded & parsed PDF!`);
                success++;
            }
        } catch (err) {
            console.error(`  -> HTTP Request Failed:`, err.message);
            failed++;
        }

        // Extremely safe rate-limit (3 seconds) to ensure BSE doesn't block local dev node
        await new Promise(r => setTimeout(r, 3000));
    }

    console.log(`\n✅ Pre-IPO Batch Caching Complete!`);
    console.log(`🎉 New Documents Fetched: ${success}`);
    console.log(`⏭️ Skipped (Cache Hits): ${skipped}`);
    console.log(`❌ Failed Lookups: ${failed}`);
}

run();
