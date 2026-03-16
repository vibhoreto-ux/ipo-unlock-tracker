async function clientSearchBSENotice(companyName, listingDateISO) {
    const listDate = new Date(listingDateISO);
    const normalized = companyName
        .toUpperCase()
        .replace(/ (LTD|LIMITED|INDIA|PRIVATE|PVT)\.?/g, '')
        .replace(/[^A-Z0-9 ]/g, '')
        .trim();
    const words = normalized.split(/\s+/).filter(w => w.length >= 3);
    console.log(`Words:`, words);

    const dates = [];
    for (let offset = -1; offset <= 1; offset++) {
        const d = new Date(listDate);
        d.setDate(d.getDate() + offset);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${y}${m}${day}`);
    }
    console.log(`Dates:`, dates);

    // Let's just check the known Notice ID directly through the same logic
    const noticeId = '20250203-42';
    const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`;
    
    const { execSync } = require('child_process');
    try {
        const html = execSync(`curl -s '${url}' -H 'User-Agent: Mozilla/5.0'`).toString('utf8');
        const upper = html.toUpperCase();
        console.log(`Contains LISTING or ADMITTED?`, upper.includes('LISTING') || upper.includes('SHARES ADMITTED'));
        
        const matchCount = words.filter(w => upper.includes(w)).length;
        console.log(`Matched ${matchCount}/${words.length} words`);
        for (const w of words) {
            console.log(`  - ${w}: ${upper.includes(w)}`);
        }
    } catch(e) { console.error(e); }
}

clientSearchBSENotice("Malpani Pipes & Fittings Ltd.", "2025-02-04T00:00:00.000Z");
