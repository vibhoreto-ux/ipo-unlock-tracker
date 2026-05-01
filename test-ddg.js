const axios = require('axios');
const cheerio = require('cheerio');

async function testDDGLite(query) {
    console.log(`Searching DDG Lite for: ${query}`);
    try {
        const res = await axios.post('https://lite.duckduckgo.com/lite/', 
            `q=${encodeURIComponent(query)}&kl=in-en`, 
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            }
        );
        const $ = cheerio.load(res.data);
        const links = [];
        $('.result-snippet').each((i, el) => {
            // In DDG lite, the actual link is somewhat nearby, let's just grab all hrefs that end in pdf
        });
        
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('http') && href.toLowerCase().endsWith('.pdf')) {
                links.push(href);
            }
        });
        console.log(`Found ${links.length} PDF links:`, links.slice(0, 3));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testDDGLite('"Vivid Electromech" RHP filetype:pdf');
