const { scrapeWithBrowser } = require('./browser-scraper.js');

async function test() {
    console.log("Testing scraper for 2025 and 2026");
    const data25 = await scrapeWithBrowser(2025, []);
    const data26 = await scrapeWithBrowser(2026, []);
    const merged = [...data25, ...data26];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = merged.filter(c => {
        if (!c.allotmentDate) return true;
        const d = new Date(c.allotmentDate.original);
        d.setHours(0,0,0,0);
        return d > today;
    });

    console.log(`Found ${upcoming.length} upcoming IPOs from API:`);
    upcoming.forEach(c => {
        console.log(`- ${c.companyName}`);
    });
}
test();
