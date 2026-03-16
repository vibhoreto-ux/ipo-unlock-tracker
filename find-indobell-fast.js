const { exec } = require('child_process');

const companyName = "INDOBELL";
let found = false;

async function checkUrl(url, noticeId) {
    return new Promise((resolve) => {
        exec(`curl -s --max-time 3 '${url}' -H 'User-Agent: Mozilla/5.0'`, (err, stdout) => {
            if (!err && stdout && (stdout.includes(companyName) || stdout.includes("Indobell"))) {
                if (stdout.toLowerCase().includes("annexure") && stdout.toLowerCase().includes("pdf")) {
                    console.log(`\n\n✅ PERFECT MATCH!!! Notice ID: ${noticeId}\nURL: ${url}\n\n`);
                    found = true;
                } else {
                    console.log(`Found mention of Indobell on ${noticeId} but no annexure pdf.`);
                }
            }
            resolve();
        });
    });
}

async function bruteForceSearch(listingDateStr) {
    const listDate = new Date(listingDateStr);
    const promises = [];
    
    // Scan up to 15 days after listing date
    for (let offset = -4; offset <= 15; offset++) {
        let testDate = new Date(listDate);
        testDate.setDate(testDate.getDate() + offset);
        
        const year = testDate.getFullYear();
        const month = String(testDate.getMonth() + 1).padStart(2, '0');
        const day = String(testDate.getDate()).padStart(2, '0');
        const datePrefix = `${year}${month}${day}`;
        
        console.log(`Scanning ${datePrefix}...`);
        
        for (let i = 1; i <= 80; i++) {
            const noticeId = `${datePrefix}-${i}`;
            const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`;
            promises.push(checkUrl(url, noticeId));
            
            // batching
            if (promises.length >= 40) {
                await Promise.all(promises);
                promises.length = 0;
                if (found) return;
            }
        }
    }
    await Promise.all(promises);
    console.log("Done checking.");
}

bruteForceSearch("2025-01-13T00:00:00.000Z");
