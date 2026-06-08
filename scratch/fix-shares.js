const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const DB_PATH = path.join(__dirname, '..', 'data', 'unlock-data.json');
let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
const today = new Date();
today.setHours(0,0,0,0);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.chittorgarh.com/',
    'Origin': 'https://www.chittorgarh.com',
};

async function fetchAnchorInvestorNames(chittorgarhUrl) {
    const empty = { investors: [], anchorShares: 0, totalShares: 0 };
    if (!chittorgarhUrl) return empty;
    try {
        const subUrl = chittorgarhUrl.replace('/ipo/', '/ipo_subscription/');
        const resp = await axios.get(subUrl, {
            headers: { ...HEADERS, 'Referer': 'https://www.chittorgarh.com/' },
            timeout: 15000
        });
        const $ = cheerio.load(resp.data);

        const investors = [];
        const anchorSection = $('#anchorinvestorlist');
        if (anchorSection.length) {
            anchorSection.find('table tr').each((j, row) => {
                const cells = $(row).find('td');
                if (cells.length >= 4) {
                    const investorName = $(cells.eq(1)).text().trim();
                    if (investorName && !investorName.match(/^(total|#|sr|s\.no|\d+$)/i)) {
                        investors.push(investorName);
                    }
                }
            });
        }

        let anchorShares = 0;
        let totalShares = 0;
        $('table').each((i, t) => {
            const text = $(t).text().toLowerCase();
            if (text.includes('shares offered') && text.includes('total')) {
                $(t).find('tr').each((j, row) => {
                    const cells = $(row).find('td');
                    if (cells.length >= 2) {
                        const category = $(cells.eq(0)).text().replace(/\u00a0/g, ' ').trim().toLowerCase();
                        const sharesText = $(cells.eq(1)).text().trim().replace(/,/g, '');
                        const shares = parseInt(sharesText);
                        if (category === 'anchor' && !isNaN(shares)) {
                            anchorShares = shares;
                        }
                        if (category === 'total' && !isNaN(shares)) {
                            totalShares = shares;
                        }
                    }
                });
            }
        });

        if (!anchorShares || !totalShares) {
            const body = $('body').text();
            if (!anchorShares) {
                const m = body.match(/shares_offered_anchor_investor.*?(\d+)/);
                if (m) anchorShares = parseInt(m[1]);
            }
            if (!totalShares) {
                const m = body.match(/total_shares_offered["\s:]+(\d+)/) || body.match(/issue_shares["\s:]+(\d+)/);
                if (m) totalShares = parseInt(m[1]);
            }
        }

        return { investors, anchorShares, totalShares };
    } catch (e) {
        console.warn(`Error fetching sub page: ${e.message}`);
        return empty;
    }
}

async function main() {
    const upcoming = db.companies.filter(c => {
        if (c.companyName.toLowerCase().includes('invit')) return false;
        const listDateStr = c.allotmentDate ? (c.allotmentDate.original || c.allotmentDate.adjusted) : null;
        if (!listDateStr) return true;
        const listDate = new Date(listDateStr);
        listDate.setHours(0,0,0,0);
        return listDate > today;
    });

    console.log(`Processing ${upcoming.length} upcoming IPOs...`);

    for (const company of upcoming) {
        console.log(`Fetching shares info for ${company.companyName}...`);
        const data = await fetchAnchorInvestorNames(company.chittorgarhUrl);
        if (data.totalShares > 0) {
            company.totalShares = data.totalShares;
            company.anchorShares = data.anchorShares;
            company.anchorInvestors = data.investors;
            console.log(`Success: totalShares = ${company.totalShares}, anchorShares = ${company.anchorShares}`);
        } else {
            console.log(`Failed/No data found for ${company.companyName}`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log('Finished updating database.');
}

main().catch(err => console.error(err));
