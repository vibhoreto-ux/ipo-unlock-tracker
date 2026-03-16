const { execSync } = require('child_process');
const cheerio = require('cheerio');
const id = '20250130-8';
const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${id}`;
const html = execSync(`curl -s '${url}' -H 'User-Agent: Mozilla/5.0' --compressed`).toString();
const $ = cheerio.load(html);
$('a').each((_, el) => {
    const text = ($(el).text() || '').trim().toLowerCase();
    const href = $(el).attr('href') || '';
    console.log(`[${text}] -> ${href}`);
});
