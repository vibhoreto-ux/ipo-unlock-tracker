const axios = require('axios');
const cheerio = require('cheerio');

async function getGooglePrice(companyName) {
    const query = encodeURIComponent(`${companyName} share price`);
    const url = `https://www.google.com/search?q=${query}&hl=en`;

    try {
        const resp = await axios.get(url, {
            headers: {
                // Must mock a full browser user agent to get the rich finance card
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(resp.data);

        // Google Finance rich card price selector. Typically spans with these specific classes or dataset attributes hold it.
        // The main price is usually a large font span. E.g. <span class="IsqQVc NprOob w8qArf">...</span>
        let price = $('span[jsname="vWLAgc"]').text().trim(); // standard desktop finance widget price
        if (!price) {
            price = $('span[data-ved] > span:contains("₹")').first().text().trim();
        }

        // Try other common selectors for Google finance snippet
        if (!price) {
            const allSpans = $('span');
            allSpans.each((i, el) => {
                const text = $(el).text();
                if (text && text.includes('₹') && text.length < 15) {
                    // It could be a price. Let's look for previous close
                }
            });
        }

        // Search for previous close explicitly
        let prevClose = '';
        const labels = $('div:contains("Previous close")').parent();
        labels.each((i, el) => {
            const text = $(el).text();
            if (text.includes('Previous close')) {
                const parts = text.split('Previous close');
                prevClose = parts[1] && parts[1].trim();
            }
        });

        console.log(`Company: ${companyName}`);
        console.log(`Price Found: ${price}`);
        console.log(`Previous Close text block: ${prevClose}`);

    } catch (e) {
        console.error("Error for", companyName, e.message);
    }
}

async function run() {
    await getGooglePrice('Swiggy Ltd.');
    await getGooglePrice('Striders Impex Ltd.');
    await getGooglePrice('Modern Diagnostic');
}

run();
