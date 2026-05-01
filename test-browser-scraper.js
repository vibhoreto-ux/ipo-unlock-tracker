const bs = require('./browser-scraper.js');

async function test() {
    console.log("=== Amir Chand ===");
    let ac = await bs.scrapeWithBrowser(2026, [], true); // This will fetch 2026 IPOs
    let amir = ac.find(x => x.companyName && x.companyName.includes('Amir Chand'));
    let sai = ac.find(x => x.companyName && x.companyName.includes('Sai'));
    let novus = ac.find(x => x.companyName && x.companyName.includes('Novus'));

    console.log("Amir: ", amir ? `Anchors: ${amir.anchorShares}, Total: ${amir.totalShares}` : "Not found");
    console.log("Sai: ", sai ? `Anchors: ${sai.anchorShares}, Total: ${sai.totalShares}` : "Not found");
    console.log("Novus: ", novus ? `Anchors: ${novus.anchorShares}, Total: ${novus.totalShares}` : "Not found");
}

test();
