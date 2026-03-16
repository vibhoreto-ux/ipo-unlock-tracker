const { execSync } = require('child_process');
const cheerio = require('cheerio');

const dates = ['20250129', '20250130', '20250131', '20250201', '20250202', '20250203', '20250204'];

for (const date of dates) {
    for (let i = 1; i <= 60; i++) {
        const id = `${date}-${i}`;
        const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${id}`;
        try {
            const html = execSync(`curl -m 10 -s '${url}' -H 'User-Agent: Mozilla/5.0' --compressed`).toString();
            if (html.length < 2000) continue;
            
            const upper = html.toUpperCase();
            if (upper.includes('H.M.') || (upper.includes('HM ') && upper.includes('ELECTRO')) || upper.includes('H. M.')) {
                if (!upper.includes('ANNEXURE') || !upper.includes('.PDF')) {
                    console.log(`Skipped HM Electro: ${id} (no PDF/Annexure)`);
                    continue;
                }
                console.log(`✅ FOUND HM Electro Notice: ${id}`);
                process.exit(0);
            }
        } catch (e) {}
    }
}
console.log('Not found');
