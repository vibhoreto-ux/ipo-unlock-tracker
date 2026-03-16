const cheerio = require('cheerio');
const { execSync } = require('child_process');

async function testFetch() {
    try {
        const noticeId = "20250220-33";
        const noticeUrl = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`;
        const html = execSync(`curl -s '${noticeUrl}' -H 'User-Agent: Mozilla/5.0'`).toString('utf8');
        const $ = cheerio.load(html);
        let annexureUrl = null;

        $('a').each((_, el) => {
            const text = ($(el).text() || '').trim().toLowerCase();
            const href = $(el).attr('href') || '';
            console.log(`Found link: [${text}] -> ${href}`);

            if (text.includes('annexure') && (text.includes('ii') || text.includes(' 2'))) {
                return; // Skip Annexure II entirely
            }

            // Match Annexure-I but not Annexure-II
            if (text.includes('annexure-i') || text.includes('annexure - i')) {
                if (!annexureUrl) annexureUrl = href;
            } else if (text === 'annexure-i.pdf' || text === 'annexure - i.pdf') {
                if (!annexureUrl) annexureUrl = href;
            } else if (text.includes('annexure') && text.includes('.pdf') && !text.includes('annexure_')) {
                if (!annexureUrl) annexureUrl = href;
            } else if ((text.includes('annexure i') || text.includes('annexure 1'))) {
                if (!annexureUrl) annexureUrl = href;
            } else if ((text.includes('annexure') || text.includes('annex')) && href.includes('DownloadAttach')) {
                if (!annexureUrl) annexureUrl = href;
            }
        });
        console.log(`\nSelected Annexure URL: ${annexureUrl}`);
    } catch (e) {
        console.error(e);
    }
}
testFetch();
