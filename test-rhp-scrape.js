const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const url = 'https://www.chittorgarh.com/report/ipo-in-india-list-main-board-sme/82/?year=2025';
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
    const $ = cheerio.load(res.data);
    
    const firstRow = $('table.data-table tbody tr').first();
    const firstCol = firstRow.find('td').first();
    const link = firstCol.find('a').attr('href');
    
    console.log("Found IPO Link:", link);
    
    // Now fetch that IPO link and look for RHP
    if(link) {
        const ipoRes = await axios.get(link, { headers: { 'User-Agent': 'Mozilla/5.0' }});
        const ipo$ = cheerio.load(ipoRes.data);
        
        let rhpLink = '';
        ipo$('a').each((i, el) => {
            const txt = ipo$(el).text().toLowerCase();
            const href = ipo$(el).attr('href');
            if(txt.includes('rhp') || (href && href.toLowerCase().includes('rhp'))) {
                console.log("RHP Found:", txt, "->", href);
                rhpLink = href;
            }
        });
        
    }
}
test();
