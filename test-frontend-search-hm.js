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

    const { execSync } = require('child_process');
    for (const dateStr of dates) {
        console.log(`\nScanning date: ${dateStr}`);
        for (let i = 1; i <= 80; i++) {
            const noticeId = `${dateStr}-${i}`;
            const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`;
            try {
                const html = execSync(`curl -s '${url}' -H 'User-Agent: Mozilla/5.0'`).toString('utf8');
                if (html.length < 5000) continue;
                const upper = html.toUpperCase();
                
                if (!upper.includes('LISTING') && !upper.includes('SHARES ADMITTED')) continue;
                
                const matchCount = words.filter(w => upper.includes(w)).length;
                if (matchCount < Math.min(words.length, 2)) continue;

                if (!upper.includes('ANNEXURE') || !upper.includes('.PDF')) {
                    console.log(`Skipped ${noticeId} (Matched but no Annexure/PDF)`);
                    continue;
                }
                
                console.log(`\n✅ FOUND EXACT MATCH: ${noticeId}`);
                process.exit(0);
            } catch(e) {}
        }
    }
}

clientSearchBSENotice("H.M.Electro Mech Ltd.", "2025-01-31T00:00:00.000Z");
