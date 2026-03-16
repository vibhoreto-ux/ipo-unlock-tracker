const { scrapeIPOList } = require('./scraper');
const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    // Replicate part of scrapeIPOList to get the specific company URL
    const url = 'https://www.chittorgarh.com/report/ipo-in-india-list-main-board-sme/82/?year=2025';
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
    const $ = cheerio.load(res.data);
    
    let table = $('table.table-bordered');
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

    console.log("Found IPO detailed link:", firstLink);

    if (firstLink) {
        const ipoRes = await axios.get(firstLink, { headers: { 'User-Agent': 'Mozilla/5.0' }});
        const ipo$ = cheerio.load(ipoRes.data);
        
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
