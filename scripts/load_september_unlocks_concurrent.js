const fs = require('fs');
const path = require('path');
const db = require('../db');
const { getUnlockPercentages } = require('../circular-scraper');
const { extractFromCapitalStructure, fetchCapitalStructureUrl } = require('../capital-structure-scraper');

async function processCompany(company, idx, total) {
    const companyName = company.companyName;
    const exchange = company.exchange || '';
    const getIso = (d) => {
        if (!d) return '';
        if (typeof d === 'string') return d;
        return d.adjusted || d.original || '';
    };
    const listingDate = getIso(company.listingDate) || getIso(company.allotmentDate);

    console.log(`[${idx + 1}/${total}] START: ${companyName} (${company.issueType}, ${exchange})`);

    // 1. Fetch / Verify Circular Data
    let circData = db.getCircularData(companyName);
    if (!circData || !circData.found || !circData.unlockEvents || circData.unlockEvents.length === 0) {
        try {
            const circRes = await getUnlockPercentages(companyName, exchange, listingDate, company.totalShares);
            if (circRes && circRes.unlockEvents && circRes.unlockEvents.length > 0) {
                circData = { found: true, ...circRes };
                db.saveCircularData(companyName, circData);
                console.log(`[Circular] SUCCESS for ${companyName}: ${circRes.source} circular (${circRes.unlockEvents.length} events)`);
            } else if (circRes && circRes.bseNoticeId) {
                circData = { found: true, ...circRes };
                db.saveCircularData(companyName, circData);
                console.log(`[Circular] BSE Notice ID for ${companyName}: ${circRes.bseNoticeId}`);
            }
        } catch (circErr) {
            console.warn(`[Circular] Error for ${companyName}:`, circErr.message);
        }
    } else {
        console.log(`[Circular] CACHED for ${companyName}: ${circData.unlockEvents?.length || 0} events`);
    }

    // Attach circular URLs to company object if available
    if (circData) {
        if (circData.pdfUrl) {
            if (circData.source === 'NSE' || (circData.pdfUrl && circData.pdfUrl.includes('nseindia'))) {
                company.nseCircularUrl = circData.pdfUrl;
                company.circularUrl = circData.pdfUrl;
            } else {
                company.bseCircularUrl = circData.pdfUrl;
                company.circularUrl = circData.pdfUrl;
            }
        }
        if (circData.annexureUrl) company.annexureUrl = circData.annexureUrl;
        if (circData.unlockEvents && (!company.lockInEvents || company.lockInEvents.length === 0)) {
            company.lockInEvents = circData.unlockEvents;
        }
        if (circData.totalShares && (!company.totalShares || company.totalShares === 0)) {
            company.totalShares = circData.totalShares;
        }
    }

    // 2. Fetch / Verify Capital Structure & Pre-IPO Investors
    let targetDoc = company.capitalStructureUrl || company.rhpUrl;
    if (!targetDoc) {
        try {
            const fetchedDoc = await fetchCapitalStructureUrl(companyName);
            if (fetchedDoc) {
                targetDoc = fetchedDoc;
                if (fetchedDoc.toLowerCase().includes('capital_structure')) {
                    company.capitalStructureUrl = fetchedDoc;
                } else {
                    company.rhpUrl = fetchedDoc;
                }
                console.log(`[CapStruct] Resolved doc for ${companyName}: ${targetDoc}`);
            }
        } catch (docErr) {
            console.warn(`[CapStruct] Error finding doc for ${companyName}:`, docErr.message);
        }
    }

    const hasPreIpo = company.preIpoInvestors && company.preIpoInvestors.length > 0;
    if (!hasPreIpo && targetDoc) {
        try {
            const isSme = company.issueType === 'SME';
            const csRes = await extractFromCapitalStructure(companyName, targetDoc, isSme);
            if (csRes && Array.isArray(csRes.preIpoInvestors) && csRes.preIpoInvestors.length > 0) {
                company.preIpoInvestors = csRes.preIpoInvestors;
                if (csRes.waca) company.preIpoWaca = csRes.waca;
                if (csRes.peerComparison) company.peerComparison = csRes.peerComparison;
                console.log(`[PreIPO] SUCCESS for ${companyName}: ${csRes.preIpoInvestors.length} pre-IPO investors (WACA: ${csRes.waca || 'N/A'})`);
            } else {
                company.preIpoInvestors = [];
            }
        } catch (csErr) {
            console.warn(`[PreIPO] Extraction error for ${companyName}:`, csErr.message);
            company.preIpoInvestors = company.preIpoInvestors || [];
        }
    }

    console.log(`[${idx + 1}/${total}] DONE: ${companyName}`);
}

async function run() {
    console.log('=== Starting Concurrent September 2026 Unlock & Circular Loader ===');
    const dbData = db.readDB();
    const companies = dbData.companies || [];

    const getIso = (d) => {
        if (!d) return '';
        if (typeof d === 'string') return d;
        return d.adjusted || d.original || '';
    };

    const septCompanies = companies.filter(c => {
        const listDate = getIso(c.listingDate) || getIso(c.allotmentDate);
        const preExp = getIso(c.preIPO?.expiryDate) || getIso(c.preIPO?.unlockDate);
        
        let match = false;
        if (preExp.startsWith('2026-09')) match = true;
        if (c.lockInEvents && c.lockInEvents.some(e => {
            const ed = getIso(e.unlockDate) || getIso(e.expiryDate) || getIso(e.eventDate);
            return ed.startsWith('2026-09');
        })) match = true;
        
        if (c.issueType === 'SME' && listDate.startsWith('2025-09')) match = true;
        if (c.issueType === 'Mainboard' && listDate.startsWith('2026-03')) match = true;

        return match;
    });

    console.log(`Targeting ${septCompanies.length} September 2026 unlock companies with concurrency = 4`);

    const CONCURRENCY = 4;
    for (let i = 0; i < septCompanies.length; i += CONCURRENCY) {
        const chunk = septCompanies.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((c, offset) => processCompany(c, i + offset, septCompanies.length)));
        // Save progress after each batch
        db.writeDB(dbData);
    }

    // Final write to disk
    db.writeDB(dbData);
    console.log('\n=== ALL SEPTEMBER 2026 UNLOCKS & CIRCULARS PROCESSED & SAVED! ===');
}

run().catch(err => {
    console.error('Fatal error running concurrent loader:', err);
});
