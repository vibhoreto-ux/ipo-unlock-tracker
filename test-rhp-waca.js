const axios = require('axios');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');
const fs = require('fs');

async function getRhpPdfLink(chittorgarhUrl) {
    try {
        console.log("Fetching: " + chittorgarhUrl);
        const res = await axios.get(chittorgarhUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(res.data);

        // Find document links block
        let pdfUrl = null;
        $('a').each((i, el) => {
            const txt = $(el).text().toLowerCase();
            const href = $(el).attr('href');
            if (href && href.endsWith('.pdf') && (txt.includes('rhp') || href.toLowerCase().includes('rhp'))) {
                pdfUrl = href;
            }
        });
        // Try falling back to generic pdfs if RHP is not explicitly named but exists
        if (!pdfUrl) {
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.toLowerCase().includes('rhp') && href.endsWith('.pdf')) {
                    pdfUrl = href;
                }
            });
        }
        return pdfUrl;
    } catch (e) {
        console.error("Error finding RHP link:", e.message);
        return null;
    }
}

async function run() {
    const url = "https://www.chittorgarh.com/ipo/indo-smc-ipo/2694/";
    const pdfUrl = await getRhpPdfLink(url);
    if (!pdfUrl) {
        console.log("No PDF URL found.");
        return;
    }
    console.log("Found PDF URL:", pdfUrl);

    try {
        // Download PDF
        const pdfRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        console.log("PDF Downloaded. Parsing...");

        const data = await pdf(pdfRes.data);
        fs.writeFileSync('debug_rhp.txt', data.text);
        console.log("Saved raw text to debug_rhp.txt (total chars: " + data.text.length + ")");

        // Excerpt search for WACA
        const lower = data.text.toLowerCase();
        let wacaIndex = lower.indexOf("weighted average cost of acquisition");
        if (wacaIndex === -1) wacaIndex = lower.indexOf("waca");

        if (wacaIndex !== -1) {
            console.log("\n--- WACA Excerpt Found ---");
            const start = Math.max(0, wacaIndex - 500);
            const end = Math.min(data.text.length, wacaIndex + 2000);
            console.log(data.text.substring(start, end));
        } else {
            console.log("WACA not found directly by keyword.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
