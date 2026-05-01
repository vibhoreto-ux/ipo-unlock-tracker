const cheerio = require('cheerio');
async function run() {
    try {
        const res = await fetch('https://www.tankup.co.in', { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await res.text();
        const $ = cheerio.load(html);
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                console.log($(el).text().trim().substring(0, 30), "->", href);
            }
        });
    } catch(e) {
        console.error(e.message);
    }
}
run();
