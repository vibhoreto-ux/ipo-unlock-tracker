const { execSync } = require('child_process');
const cheerio = require('cheerio');

const dates = ['20250129', '20250130', '20250131', '20250201', '20250202', '20250203', '20250204'];

for (const date of dates) {
    for (let i = 1; i <= 60; i++) {
        const id = `${date}-${i}`;
        const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${id}`;
        try {
            const html = execSync(`curl -s '${url}' -H 'User-Agent: Mozilla/5.0' --compressed`).toString();
            if (html.length < 2000) continue;
            
            const upper = html.toUpperCase();
            if (upper.includes('H.M.') || upper.includes('H. M.') || upper.includes('HM ELECTRO') || upper.includes('H M ELECTRO')) {
                console.log(`✅ FOUND HM Electro Notice: ${id}`);
                
                // Let's get the annexure URL
                const $ = cheerio.load(html);
                let annexureUrl = null;
                $('a').each((_, el) => {
                    const text = ($(el).text() || '').trim().toLowerCase();
                    const href = $(el).attr('href') || '';
                    if (href.includes('DownloadAttach') && text.includes('annexure')) {
                        annexureUrl = href;
                    }
                });
                console.log(`Annexure URL: ${annexureUrl}`);
                process.exit(0);
            }
        } catch (e) {}
    }
}
console.log('Not found');
