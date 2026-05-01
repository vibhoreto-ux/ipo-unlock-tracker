async function testExtraction(url) {
    const HEADERS = { 'User-Agent': 'Mozilla/5.0' };
    try {
        const resp = await fetch(url, { headers: HEADERS });
        const text = await resp.text();
        
        let anchorShares = 0;
        let totalShares = 0;
        
        const mAnchor = text.match(/shares_offered_anchor_investor.*?(\d+)/);
        if (mAnchor) anchorShares = parseInt(mAnchor[1]);

        const mTotal = text.match(/total_shares_offered.*?(\d+)/);
        if (mTotal) totalShares = parseInt(mTotal[1]);
        
        console.log(`[${url}] Extracted from body fallback: Anchor ${anchorShares}, Total ${totalShares}`);

        // Try to find the HTML table
        const tableMatch = text.match(/<table[^>]*>([\s\S]*?)<\/table>/g);
        if (tableMatch) {
            tableMatch.forEach(t => {
                const lowerT = t.toLowerCase();
                if (lowerT.includes('shares offered') && lowerT.includes('total') && lowerT.includes('anchor')) {
                    console.log(`[${url}] Found candidate table`);
                    // Find rows
                    const rows = t.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
                    rows.forEach(r => {
                        const cells = r.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
                        if (cells.length >= 2) {
                            const cat = cells[0].replace(/<[^>]+>/g, '').trim().toLowerCase();
                            const valText = cells[1].replace(/<[^>]+>/g, '').replace(/,/g, '').trim();
                            console.log(`Row: ${cat} | ${valText}`);
                        }
                    });
                }
            });
        }
    } catch (e) {
        console.error(e.message);
    }
}

testExtraction('https://www.chittorgarh.com/ipo_subscription/sai-parenterals-ipo/2681/').then(() => {
    testExtraction('https://www.chittorgarh.com/ipo_subscription/amir-chand-jagdish-kumar-ipo/2501/');
});
