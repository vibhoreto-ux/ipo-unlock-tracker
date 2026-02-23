const axios = require('axios');

async function run() {
    console.log("Fetching all companies...");
    const res = await axios.get('http://localhost:3001/api/unlock-data');
    const companies = res.data.data;

    // Date Bounds (Local timezone math)
    const now = new Date();

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    thisMonthEnd.setHours(23, 59, 59, 999);

    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    lastMonthStart.setHours(0, 0, 0, 0);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    lastMonthEnd.setHours(23, 59, 59, 999);

    function getDateFromObj(obj) {
        if (!obj) return null;
        const s = obj.adjusted || obj.expiryDate || obj.original || obj.originalDate;
        return s ? new Date(s) : null;
    }

    const targetCompanies = companies.filter(c => {
        const dates = [];
        if (c.anchor30) dates.push(getDateFromObj(c.anchor30));
        if (c.anchor90) dates.push(getDateFromObj(c.anchor90));
        if (c.preIPO) dates.push(getDateFromObj(c.preIPO));

        const hasRecentEvent = dates.some(d => {
            if (!d) return false;
            const isThisMonth = d >= thisMonthStart && d <= thisMonthEnd;
            const isLastMonth = d >= lastMonthStart && d <= lastMonthEnd;
            return isThisMonth || isLastMonth;
        });

        // We want the OPPOSITE: Companies that DO NOT have an event in this month or last month
        return !hasRecentEvent;
    });

    console.log(`Found ${targetCompanies.length} companies outside This Month / Last Month bounds.`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < targetCompanies.length; i++) {
        const c = targetCompanies[i];
        console.log(`[${i + 1}/${targetCompanies.length}] Fetching details for: ${c.companyName} (${c.exchange})`);
        try {
            const detailRes = await axios.get(`http://localhost:3001/api/unlock-details/${encodeURIComponent(c.companyName)}`, {
                timeout: 45000 // 45 seconds timeout because BSE/NSE PDFs can be slow
            });

            if (detailRes.data.fromCache) {
                console.log(` -> Already in DB Cache.`);
                skipped++;
            } else if (detailRes.data.error || detailRes.data.found === false) {
                console.log(` -> Fetch Error/Not Found: ${detailRes.data.error || detailRes.data.message || 'No circular'}`);
                failed++;
            } else {
                console.log(` -> Success! Fetched and cached PDF lock-ins.`);
                success++;
            }
        } catch (err) {
            console.error(` -> HTTP Request Failed:`, err.message);
            failed++;
        }

        // 1 second delay between fetches to respect exchange rate limits
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n✅ Pre-Cache Batch Complete for Remaining!`);
    console.log(`🎉 New Fetches: ${success}`);
    console.log(`⏭️ Skipped (Already Cached): ${skipped}`);
    console.log(`❌ Failed Docs: ${failed}`);
}

run();
