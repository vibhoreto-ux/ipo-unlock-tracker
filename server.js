const express = require('express');
const cors = require('cors');
const { scrapeUnlockData } = require('./scraper');
const { readDB, writeDB, mergeCompanies } = require('./db');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

const { getNextBusinessDay, calculatePreIPOLockin } = require('./holidays');

/**
 * POST /api/import-data
 * Accepts scraped anchor + IPO data from browser, processes it, merges into DB
 * Body: { anchorData: [...], ipoData: [...], year: number }
 */
app.post('/api/import-data', (req, res) => {
    try {
        const { anchorData = [], ipoData = [], year } = req.body;
        console.log(`\nImporting data: ${anchorData.length} anchor records, ${ipoData.length} IPO records (year: ${year})`);

        // Process IPO data - build company records
        const companies = [];
        const seenNames = new Set();

        for (const ipo of ipoData) {
            const name = ipo.companyName || ipo.company || '';
            if (!name || seenNames.has(name)) continue;
            seenNames.add(name);

            const listingAt = ipo.listingAt || ipo.exchange || '';
            // Determine issue type from exchange field first
            let issueType = listingAt.includes('SME') ? 'SME' : 'Mainboard';
            // Cross-reference with anchor data's issueType if available
            const nameSimpleForType = name.toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();
            const anchorTypeMatch = anchorData.find(a => {
                const aName = (a.companyName || '').toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();
                return nameSimpleForType.includes(aName) || aName.includes(nameSimpleForType);
            });
            if (anchorTypeMatch && anchorTypeMatch.issueType) {
                issueType = anchorTypeMatch.issueType;
            }
            // Normalize: anchor data uses 'Mainline', we use 'Mainboard'
            if (issueType === 'Mainline') issueType = 'Mainboard';

            // Parse the close date as proxy for allotment date
            const closeDateStr = ipo.closeDate || '';
            const closeDate = parseImportDate(closeDateStr);
            let allotmentDate = null;
            if (closeDate) {
                const adjusted = getNextBusinessDay(closeDate);
                allotmentDate = {
                    original: closeDate.toISOString(),
                    adjusted: adjusted.toISOString(),
                    isAdjusted: closeDate.getTime() !== adjusted.getTime()
                };
            }

            // Find anchor match
            const nameSimple = name.toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();
            const anchorMatch = anchorData.find(a => {
                const aName = (a.companyName || '').toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();
                return nameSimple.includes(aName) || aName.includes(nameSimple);
            });

            let anchor30 = null, anchor90 = null;
            if (anchorMatch) {
                const d30 = parseImportDate(anchorMatch.date30);
                const d90 = parseImportDate(anchorMatch.date90);
                if (d30) {
                    const adj30 = getNextBusinessDay(d30);
                    anchor30 = { original: d30.toISOString(), adjusted: adj30.toISOString(), isAdjusted: d30.getTime() !== adj30.getTime() };
                }
                if (d90) {
                    const adj90 = getNextBusinessDay(d90);
                    anchor90 = { original: d90.toISOString(), adjusted: adj90.toISOString(), isAdjusted: d90.getTime() !== adj90.getTime() };
                }
            }

            companies.push({
                companyName: name,
                issueType,
                allotmentDate,
                anchor30,
                anchor90,
                preIPO: calculatePreIPOLockin(
                    allotmentDate ? (allotmentDate.adjusted || allotmentDate.original) : null,
                    issueType
                )
            });
        }

        // Also add any anchor-only companies not in IPO list
        for (const anchor of anchorData) {
            const name = anchor.companyName || '';
            if (!name || seenNames.has(name)) continue;
            seenNames.add(name);

            let issueType = anchor.issueType || 'Mainboard';
            if (issueType === 'Mainline') issueType = 'Mainboard';
            const allotDate = parseImportDate(anchor.allotmentDate);
            let allotmentDate = null;
            if (allotDate) {
                const adjusted = getNextBusinessDay(allotDate);
                allotmentDate = {
                    original: allotDate.toISOString(),
                    adjusted: adjusted.toISOString(),
                    isAdjusted: allotDate.getTime() !== adjusted.getTime()
                };
            }

            const d30 = parseImportDate(anchor.date30);
            const d90 = parseImportDate(anchor.date90);
            let anchor30 = null, anchor90 = null;
            if (d30) {
                const adj30 = getNextBusinessDay(d30);
                anchor30 = { original: d30.toISOString(), adjusted: adj30.toISOString(), isAdjusted: d30.getTime() !== adj30.getTime() };
            }
            if (d90) {
                const adj90 = getNextBusinessDay(d90);
                anchor90 = { original: d90.toISOString(), adjusted: adj90.toISOString(), isAdjusted: d90.getTime() !== adj90.getTime() };
            }

            companies.push({
                companyName: name,
                issueType,
                allotmentDate,
                anchor30,
                anchor90,
                preIPO: calculatePreIPOLockin(
                    allotmentDate ? (allotmentDate.adjusted || allotmentDate.original) : null,
                    issueType
                )
            });
        }

        console.log(`Processed ${companies.length} companies from import`);

        // Merge into DB
        const db = readDB();
        const merged = mergeCompanies(db.companies, companies);
        const now = new Date().toISOString();
        writeDB({
            companies: merged,
            lastUpdated: now,
            lastScraped: {
                time: now,
                importedAnchor: anchorData.length,
                importedIPO: ipoData.length,
                year: year
            }
        });

        res.json({
            success: true,
            imported: companies.length,
            totalInDB: merged.length,
            message: `Imported ${companies.length} companies (${anchorData.length} anchor + ${ipoData.length} IPO records)`
        });

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: error.message });
    }
});

function parseImportDate(dateStr) {
    if (!dateStr || dateStr === '--' || dateStr === '') return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/unlock-data
 * 
 * Without ?refresh: return data from local DB
 * With ?refresh=true: scrape fresh data, merge into DB, save, and return
 */
app.get('/api/unlock-data', async (req, res) => {
    try {
        const db = readDB();

        // If no refresh requested, return DB data
        if (!req.query.refresh) {
            return res.json({
                data: db.companies,
                source: 'database',
                lastRefreshed: db.lastUpdated,
                dbStats: {
                    totalCompanies: db.companies.length,
                    lastScraped: db.lastScraped
                }
            });
        }

        // Refresh: scrape and merge
        console.log('Fetching fresh unlock data...');

        const [data2025, data2026] = await Promise.all([
            scrapeUnlockData(2025),
            scrapeUnlockData(2026)
        ]);

        // Combine scraped data
        let newData = [...data2025, ...data2026];

        // Dedup scraped data itself
        const seen = new Set();
        newData = newData.filter(item => {
            const key = `${item.companyName}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`Scraped ${newData.length} total companies (${data2025.length} from 2025, ${data2026.length} from 2026)`);

        // Merge into existing DB
        const merged = mergeCompanies(db.companies, newData);

        const now = new Date().toISOString();
        const updatedDB = {
            companies: merged,
            lastUpdated: now,
            lastScraped: {
                time: now,
                scraped2025: data2025.length,
                scraped2026: data2026.length,
                totalNew: newData.length
            }
        };

        // Save to DB
        writeDB(updatedDB);

        res.json({
            data: merged,
            source: 'fresh',
            lastRefreshed: now,
            dbStats: {
                totalCompanies: merged.length,
                lastScraped: updatedDB.lastScraped
            }
        });

    } catch (error) {
        console.error('API Error:', error);

        // On error, try to return DB data as fallback
        try {
            const db = readDB();
            if (db.companies.length > 0) {
                return res.json({
                    data: db.companies,
                    source: 'database-fallback',
                    lastRefreshed: db.lastUpdated,
                    error: 'Scrape failed, showing cached data'
                });
            }
        } catch (e) { /* ignore */ }

        res.status(500).json({ error: 'Failed to fetch unlock data' });
    }
});

/**
 * GET /api/db-status
 * Returns info about the local database
 */
app.get('/api/db-status', (req, res) => {
    const db = readDB();
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, 'data', 'unlock-data.json');

    let fileSize = 0;
    try {
        const stats = fs.statSync(dbPath);
        fileSize = stats.size;
    } catch (e) { /* file doesn't exist yet */ }

    res.json({
        totalCompanies: db.companies.length,
        lastUpdated: db.lastUpdated,
        lastScraped: db.lastScraped,
        fileSizeKB: (fileSize / 1024).toFixed(1)
    });
});

app.listen(PORT, () => {
    const db = readDB();
    console.log(`\n🔓 IPO Unlock Tracker running at http://localhost:${PORT}`);
    console.log(`📦 Database: ${db.companies.length} companies stored`);
    if (db.lastUpdated) {
        console.log(`⏰ Last updated: ${new Date(db.lastUpdated).toLocaleString()}`);
    } else {
        console.log('📭 No data yet — click "Refresh Data" to fetch');
    }
});
