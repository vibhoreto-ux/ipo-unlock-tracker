const axios = require('axios');
const cheerio = require('cheerio');

async function bruteForceSearch(companyName, listingDateStr) {
    console.log(`Searching BSE for: ${companyName}, Listed: ${listingDateStr}`);

    // Convert to Date
    const listDate = new Date(listingDateStr);

    // Look from listingDate - 2 days to listingDate + 5 days
    for (let offset = -2; offset <= 5; offset++) {
        let testDate = new Date(listDate);
        testDate.setDate(testDate.getDate() + offset);

        const year = testDate.getFullYear();
        const month = String(testDate.getMonth() + 1).padStart(2, '0');
        const day = String(testDate.getDate()).padStart(2, '0');
        const datePrefix = `${year}${month}${day}`;

        console.log(`\nScanning dates for ${datePrefix}...`);

        // Try top 80 notice IDs for that day
        for (let i = 1; i <= 80; i++) {
            const noticeId = `${datePrefix}-${i}`;
            const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`;

            try {
                // Use curl instead of axios to bypass WAF
                const { execSync } = require('child_process');
                const html = execSync(`curl -s --max-time 3 '${url}' -H 'User-Agent: Mozilla/5.0'`).toString('utf8');

                if (html.includes(companyName) || html.includes(companyName.toUpperCase()) || html.includes('INDOBELL')) {
                    console.log(`\n✅ FOUND IT!!! Notice ID: ${noticeId}`);
                    console.log(`URL: ${url}`);
                    return noticeId;
                }
            } catch (e) {
                // Ignore timeouts
            }
        }
    }
    console.log("Not found.");
}

bruteForceSearch("Indobell Insulations Ltd", "2025-01-13T00:00:00.000Z");
