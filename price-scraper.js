const axios = require('axios');

/**
 * Utility to fetch live market price or previous close from Yahoo Finance
 * @param {string} companyName 
 * @returns {Promise<Object|null>} { price, previousClose, symbol }
 */
async function getLivePrice(companyName) {
    try {
        // Build search query, appending NS for NSE and BO for BSE
        let query = companyName.replace(/Ltd\.?$/i, '').trim();

        // Use Yahoo finance autocomplete API
        const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=3&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;

        const searchRes = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 5000
        });

        const quotes = searchRes.data.quotes || [];
        // Filter out for Indian exchanges (.NS or .BO)
        let bestQuote = quotes.find(q => q.exchange === 'NSI' || q.exchange === 'BSE' || q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'));

        if (!bestQuote && quotes.length > 0) {
            bestQuote = quotes[0];
        }

        if (bestQuote && bestQuote.symbol) {
            const symbol = bestQuote.symbol;

            // Get live quote
            const priceUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d`;
            const priceRes = await axios.get(priceUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 5000
            });

            const meta = priceRes.data.chart?.result?.[0]?.meta;
            if (meta) {
                return {
                    price: meta.regularMarketPrice,
                    previousClose: meta.previousClose,
                    symbol: symbol
                };
            }
        }
        return null; // Equivalent to unlisted
    } catch (e) {
        console.error(`[Yahoo Finance] Error fetching price for ${companyName}:`, e.message);
        return null;
    }
}

module.exports = { getLivePrice };
