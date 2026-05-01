const cheerio = require('cheerio');

async function checkUrl(url) {
    try {
        console.log("Checking:", url);
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) return;
        const html = await res.text();
        const $ = cheerio.load(html);
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().toLowerCase();
            if (href.endsWith('.pdf') && (text.includes('rhp') || text.includes('prospectus') || href.toLowerCase().includes('rhp') || href.toLowerCase().includes('prospectus'))) {
                console.log("FOUND RHP:", href.startsWith('http') ? href : new URL(href, url).href);
            }
        });
    } catch(e) {}
}

async function run() {
    await checkUrl('https://www.tankup.co.in/');
    await checkUrl('https://www.tankup.co.in/investors/');
    await checkUrl('https://www.tankup.co.in/investor-relations/');
    await checkUrl('https://www.tankup.co.in/investors.html');
}
run();
