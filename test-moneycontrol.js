const axios = require('axios');
const cheerio = require('cheerio');

async function getMoneycontrolPrice(companyName) {
    try {
        const query = companyName.replace(/Ltd\.?$/i, '').trim();
        const searchUrl = `https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?query=${encodeURIComponent(query)}&type=1&format=json`;

        const searchResp = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        let link = null;
        if (searchResp.data && searchResp.data.length > 0) {
            link = searchResp.data[0].link_src;
        }

        if (!link) {
            console.log("No URL found for", companyName);
            return;
        }

        console.log(`Moneycontrol link for ${companyName}: ${link}`);

        // Fetch the HTML page
        const htmlResp = await axios.get(link, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const $ = cheerio.load(htmlResp.data);

        // Moneycontrol usually has the price in a div with id "nsecp" or "bsecp"
        const nsePrice = $('#nsecp').attr('rel') || $('#nsecp').text().trim();
        const bsePrice = $('#bsecp').attr('rel') || $('#bsecp').text().trim();

        console.log(`NSE Price: ${nsePrice}`);
        console.log(`BSE Price: ${bsePrice}`);

    } catch (e) {
        console.error("Error for", companyName, e.message);
    }
}

async function run() {
    await getMoneycontrolPrice('Swiggy Ltd.');
    await getMoneycontrolPrice('Striders Impex Ltd.');
    await getMoneycontrolPrice('Modern Diagnostic');
}

run();
