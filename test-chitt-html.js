const axios = require('axios');
const cheerio = require('cheerio');

async function checkChittorgarh() {
    try {
        const resp = await axios.get('https://www.chittorgarh.com/report/ipo-in-india-list-main-board-sme/82/', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(resp.data);
        const rows = $('table.table tbody tr');
        console.log("Total Table Rows:", rows.length);
        
        let openCount = 0;
        rows.each((i, row) => {
            const cols = $(row).find('td');
            if (cols.length > 3) {
                const name = $(cols[0]).text().trim();
                const closeDate = $(cols[2]).text().trim();
                const listDate = $(cols[3]).text().trim();
                console.log(`- ${name} | Close: ${closeDate} | List: ${listDate}`);
                openCount++;
            }
        });
    } catch(e) {
        console.error("Error:", e.message);
    }
}
checkChittorgarh();
