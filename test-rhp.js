const axios = require('axios');
const cheerio = require('cheerio');

async function fetchPage(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 30000
        });
        return response.data;
    } catch (err) {
        console.error(`Fetch error for ${url}:`, err.message);
        return null;
    }
}

async function test() {
    const url = 'https://www.chittorgarh.com/report/ipo-in-india-list-main-board-sme/82/?year=2025';
    const html = await fetchPage(url);
    if(!html) return console.log("Failed to fetch IPO list");
    
    const $ = cheerio.load(html);
    let table = $('table.data-table');
    if (!table.length) table = $('table').first();

    let firstLink = '';
    table.find('tbody tr').each((i, el) => {
        const tds = $(el).find('td');
        if (tds.length >= 7) {
            const nameLink = $(tds[0]).find('a');
            if (nameLink.length > 0 && !firstLink) {
                firstLink = nameLink.attr('href');
            }
        }
    });

    console.log("Found IPO link:", firstLink);

    if (firstLink) {
        const ipoHtml = await fetchPage(firstLink);
        const ipo$ = cheerio.load(ipoHtml);
        
        console.log("Searching for RHP...");
        ipo$('a').each((i, el) => {
            const txt = ipo$(el).text().toLowerCase();
            const href = ipo$(el).attr('href');
            if(txt.includes('rhp') || (href && href.toLowerCase().includes('rhp'))) {
                console.log(`RHP MATCH: [${txt}] -> ${href}`);
            }
        });
    }
}
test();
