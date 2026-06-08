const axios = require('axios');
const cheerio = require('cheerio');
const url = 'https://www.chittorgarh.com/ipo_subscription/smr-jewels-ipo/2597/';
axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(res => {
    const $ = cheerio.load(res.data);
    
    let anchorShares = 0;
    let totalShares = 0;
    
    $('table').each((i, t) => {
        const text = $(t).text().toLowerCase();
        if (text.includes('shares offered') && text.includes('total')) {
            console.log('Found table matching criteria, index:', i);
            $(t).find('tr').each((j, row) => {
                const cells = $(row).find('td');
                if (cells.length >= 2) {
                    const category = $(cells.eq(0)).text().replace(/\u00a0/g, ' ').trim().toLowerCase();
                    const sharesText = $(cells.eq(1)).text().trim().replace(/,/g, '');
                    const shares = parseInt(sharesText);
                    console.log(`Row ${j}: category = "${category}", sharesText = "${sharesText}", parsed = ${shares}`);
                    if (category === 'anchor' && !isNaN(shares)) {
                        anchorShares = shares;
                    }
                    if (category === 'total' && !isNaN(shares)) {
                        totalShares = shares;
                    }
                }
            });
        }
    });

    console.log('Result:', { anchorShares, totalShares });
}).catch(err => console.error(err));
