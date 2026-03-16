const axios = require('axios');
const cheerio = require('cheerio');
async function test() {
    const resp = await axios.get('https://www.chittorgarh.com/ipo/skyways-air-ipo/2510/');
    const $ = cheerio.load(resp.data);
    $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        if (href.endsWith('.pdf')) {
            console.log('PDF LINK:', href);
            console.log('TEXT:', $(el).text().trim());
        }
    });
}
test();
