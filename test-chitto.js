const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const url = 'https://www.chittorgarh.com/ipo/accord-transformers--switchgear-ipo/1897/'; // Random guess for Accord Transformer, or we'll just search for one
    try {
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        const $ = cheerio.load(resp.data);
        console.log($('title').text());
        // Find Anchor Investors section
        console.log($('body').text().substring(0, 500));

        // Let's print out all tables or headers
        $('h2, h3').each((i, el) => {
            console.log($(el).text().trim());
        });

    } catch (e) {
        console.error(e.message);
    }
}
test();
