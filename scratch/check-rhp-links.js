const axios = require('axios');
const cheerio = require('cheerio');

const urls = {
    'Genxai Analytics': 'https://www.chittorgarh.com/ipo/genxai-analytics-ipo/2801/',
    'UHM Vacation': 'https://www.chittorgarh.com/ipo/uhm-vacation-ipo/2841/',
    'CMR Green': 'https://www.chittorgarh.com/ipo/cmr-green-technologies-ipo/2586/'
};

async function check(name, url) {
    try {
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);
        console.log(`\n=== Links for ${name} ===`);
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim().replace(/\s+/g, ' ');
            if (href.toLowerCase().endsWith('.pdf') || href.includes('pdf') || text.toLowerCase().includes('rhp') || text.toLowerCase().includes('prospectus')) {
                console.log(`- [${text}] -> ${href}`);
            }
        });
    } catch (e) {
        console.error(`Error ${name}:`, e.message);
    }
}

async function main() {
    for (const [name, url] of Object.entries(urls)) {
        await check(name, url);
    }
}

main();
