const { execSync } = require('child_process');
const cheerio = require('cheerio');
const fs = require('fs');
const pdf = require('pdf-parse');
const { parseLockInData } = require('./circular-scraper');

function curlStr(url) {
    try {
        return execSync(`curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`).toString();
    } catch (e) { return ''; }
}

async function doCompany(noticeId, name) {
    const html = curlStr(`https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`);
    const $ = cheerio.load(html);
    let annexUrl = null;

    $('a').each((_, el) => {
        const text = $(el).text().trim().toUpperCase();
        const href = $(el).attr('href') || '';
        if (text.includes('ANNEXURE II') || text.includes('ANNEXURE 2') || text.includes('ANNEXURE - II')) return;
        if (text.includes('ANNEXURE I') || text.includes('ANNEXURE - I') || href.includes('DownloadAttach')) {
            if (!annexUrl) annexUrl = href;
        }
    });

    if (!annexUrl) {
        console.log('No URL for', noticeId);
        return;
    }

    if (annexUrl.startsWith('/')) {
        annexUrl = 'https://www.bseindia.com' + annexUrl;
    } else if (!annexUrl.startsWith('http')) {
        annexUrl = 'https://www.bseindia.com/markets/MarketInfo/' + annexUrl;
    }

    console.log('PDF URL for', name, ':', annexUrl);

    try {
        const buf = execSync(`curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${annexUrl}"`);
        const data = await pdf(buf);
        fs.writeFileSync(`debug_${name}.txt`, data.text);
        console.log(`Saved debug_${name}.txt`);

        const res = await parseLockInData(buf, 'BSE');
        console.log(JSON.stringify(res, null, 2));
    } catch (e) {
        console.log('PDF error', e.message);
    }
}

async function main() {
    await doCompany('20251204-53', 'exato');
    await doCompany('20251210-77', 'luxury');
}
main();
