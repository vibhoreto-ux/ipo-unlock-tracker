const axios = require('axios');

async function getPrice(companyName, exchange) {
    try {
        // Build search query, appending NS for NSE and BO for BSE
        let query = companyName.replace(/Ltd\.?$/i, '').trim();
        console.log(`Searching for: ${query}`);

        // Use Yahoo finance autocomplete API
        const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=3&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;

        const searchRes = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const quotes = searchRes.data.quotes || [];
        // Filter out for Indian exchanges (.NS or .BO)
        let bestQuote = quotes.find(q => q.exchange === 'NSI' || q.exchange === 'BSE' || q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'));

        if (!bestQuote && quotes.length > 0) {
            bestQuote = quotes[0];
        }

        if (bestQuote) {
            const symbol = bestQuote.symbol;
            console.log(`Found Symbol: ${symbol} for ${companyName}`);

            // Get live quote
            const priceUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d`;
            const priceRes = await axios.get(priceUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });

            const meta = priceRes.data.chart.result[0].meta;
            console.log(`Regular Market Price: ${meta.regularMarketPrice}`);
            console.log(`Previous Close: ${meta.previousClose}`);
        } else {
            console.log(`No symbol found for ${companyName}`);
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

async function run() {
    await getPrice('Swiggy Ltd.', 'Mainboard');
    await getPrice('Striders Impex Ltd.', 'SME');
}

run();
