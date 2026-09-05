const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

async function crawlEntireIpoPremium() {
    console.log("=== Starting Fast Parallel IPO Premium Catalog Scraper ===");
    const cacheFile = path.join(__dirname, "..", "data", "capital-structure-cache.json");
    const ipoCacheFile = path.join(__dirname, "..", "data", "ipopremium-cache.json");
    const unlockFile = path.join(__dirname, "..", "data", "unlock-data.json");

    const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
    const ipoCache = fs.existsSync(ipoCacheFile) ? JSON.parse(fs.readFileSync(ipoCacheFile, "utf8")) : {};
    const unlockDb = JSON.parse(fs.readFileSync(unlockFile, "utf8"));

    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const mainPage = await browser.newPage();
    await mainPage.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

    console.log("1. Loading https://www.ipopremium.in/ ...");
    await mainPage.goto("https://www.ipopremium.in/", { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));

    // Gather all IPO links from homepage
    const ipoLinks = await mainPage.evaluate(() => {
        const links = [];
        const seen = new Set();
        document.querySelectorAll("a[href*=\"/view/ipo/\"]").forEach(a => {
            const href = a.href;
            const name = a.innerText.trim();
            if (href && !seen.has(href)) {
                seen.add(href);
                links.push({ href, name });
            }
        });
        return links;
    });

    console.log(`Found ${ipoLinks.length} total IPO detail links.`);
    await mainPage.close();

    // Parallel worker pool of 5 pages
    const CONCURRENCY = 5;
    const queue = [...ipoLinks];
    let completed = 0;
    let csFound = 0;

    async function worker(workerId) {
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

        while (queue.length > 0) {
            const item = queue.shift();
            if (!item) break;

            const m = item.href.match(/\/view\/ipo\/(\d+)\/([^\/]+)/);
            if (!m) continue;
            const id = parseInt(m[1]);
            const slug = m[2];
            const key = slug.replace(/[^a-z0-9]/g, "");

            try {
                await page.goto(item.href, { waitUntil: "networkidle2", timeout: 35000 });
                await new Promise(r => setTimeout(r, 1500));

                const html = await page.content();
                const pdfs = Array.from(new Set(html.match(/https?:\/\/[^"'\s<>]+\.pdf/g) || []));

                let cs = null, anchor = null, rhp = null;

                for (const p of pdfs) {
                    const low = p.toLowerCase();
                    if (low.includes("capital_structure") && !cs) cs = p;
                    if (low.includes("anchor") && !anchor) anchor = p;
                    if ((low.includes("rhp") || low.includes("prospectus") || low.includes("drhp")) && !rhp) rhp = p;
                }

                if (cs) csFound++;
                completed++;
                console.log(`[${completed}/${ipoLinks.length}] ${slug} => CS: ${cs ? "FOUND" : "null"} | Anchor: ${anchor ? "FOUND" : "null"} | RHP: ${rhp ? "FOUND" : "null"}`);

                const entry = {
                    companyName: item.name || slug,
                    id: id,
                    slug: slug,
                    detailUrl: item.href,
                    capitalStructureUrl: cs,
                    anchorPdfUrl: anchor,
                    rhpUrl: rhp,
                    updatedAt: new Date().toISOString()
                };

                cache[key] = entry;
                ipoCache[key] = entry;

            } catch (err) {
                console.warn(`  [Worker ${workerId}] Failed ${slug}: ${err.message}`);
            }
        }
        await page.close();
    }

    const workers = [];
    for (let w = 0; w < CONCURRENCY; w++) {
        workers.push(worker(w));
    }
    await Promise.all(workers);

    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), "utf8");
    fs.writeFileSync(ipoCacheFile, JSON.stringify(ipoCache, null, 2), "utf8");
    console.log(`\n✅ Saved caches with ${csFound} Capital Structure PDFs across ${completed} IPOs!`);

    await browser.close();

    // Synchronize data/unlock-data.json
    console.log("\n=== Synchronizing data/unlock-data.json ===");
    let fixedDocsCount = 0;
    let clearedRhpFromCapCount = 0;

    for (const company of unlockDb.companies) {
        const norm = (company.companyName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        
        let matched = null;
        for (const [slug, item] of Object.entries(cache)) {
            const normSlug = slug.replace(/[^a-z0-9]/g, "");
            if (norm.includes(normSlug) || normSlug.includes(norm.slice(0, 8)) || (norm.length > 5 && normSlug.includes(norm.slice(0, 6)))) {
                matched = item;
                break;
            }
        }

        if (matched) {
            if (matched.capitalStructureUrl) {
                if (company.capitalStructureUrl !== matched.capitalStructureUrl) {
                    console.log(`  Updating CS for ${company.companyName}: ${matched.capitalStructureUrl}`);
                    company.capitalStructureUrl = matched.capitalStructureUrl;
                    fixedDocsCount++;
                }
            }
            if (matched.anchorPdfUrl && !company.anchorUrl) {
                company.anchorUrl = matched.anchorPdfUrl;
            }
            if (matched.rhpUrl) {
                company.rhpUrl = matched.rhpUrl;
            }
        }

        // Cleanse: If company.capitalStructureUrl contains "rhp" or does not contain "capital_structure"
        if (company.capitalStructureUrl && (company.capitalStructureUrl.toLowerCase().includes("rhp") || !company.capitalStructureUrl.toLowerCase().includes("capital_structure"))) {
            if (!company.rhpUrl || company.rhpUrl === company.capitalStructureUrl) {
                company.rhpUrl = company.capitalStructureUrl;
            }
            company.capitalStructureUrl = null;
            clearedRhpFromCapCount++;
            console.log(`  Cleared faux capitalStructureUrl (RHP link) for ${company.companyName}`);
        }
    }

    fs.writeFileSync(unlockFile, JSON.stringify(unlockDb, null, 2), "utf8");
    console.log(`\n🎉 Sync completed! Attached ${fixedDocsCount} genuine CS links, cleansed ${clearedRhpFromCapCount} faux RHP links from capitalStructureUrl.`);
}

crawlEntireIpoPremium().catch(e => console.error(e));
