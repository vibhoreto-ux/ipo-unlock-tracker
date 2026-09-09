const fs = require('fs');
const path = require('path');
const db = require('../db');
const { getUnlockPercentages, findNSECircular, findBSENotice, parseLockInData, downloadBSEPDF, downloadNSEAnnexure } = require('../circular-scraper');
const { extractFromCapitalStructure, fetchCapitalStructureUrl } = require('../capital-structure-scraper');

async function run() {
    console.log('=== Proactively Loading September 2026 Pre-IPO Unlock & Circular Data ===');
    const dbData = db.readDB();
    const companies = dbData.companies || [];

    const getIso = (d) => {
        if (!d) return '';
        if (typeof d === 'string') return d;
        return d.adjusted || d.original || '';
    };

    // Filter companies with Pre-IPO unlock in Sept 2026
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

    console.log(`Found ${septCompanies.length} companies with September 2026 Pre-IPO unlocks.`);

    let circularSuccessCount = 0;
    let preIpoSuccessCount = 0;

    for (let i = 0; i < septCompanies.length; i++) {
        const company = septCompanies[i];
        const companyName = company.companyName;
        const exchange = company.exchange || '';
        const listingDate = getIso(company.listingDate) || getIso(company.allotmentDate);

        console.log(`\n------------------------------------------------------------`);
        console.log(`[${i + 1}/${septCompanies.length}] Processing: ${companyName} (${company.issueType}, ${exchange})`);
        console.log(`Listing Date: ${listingDate || 'N/A'}`);

        // 1. Fetch / Verify Circular Data
        let circData = db.getCircularData(companyName);
        if (!circData || !circData.found || !circData.unlockEvents || circData.unlockEvents.length === 0) {
            console.log(`[Circular] Probing circular for ${companyName}...`);
            try {
                const circRes = await getUnlockPercentages(companyName, exchange, listingDate, company.totalShares);
                if (circRes && circRes.unlockEvents && circRes.unlockEvents.length > 0) {
                    circData = { found: true, ...circRes };
                    db.saveCircularData(companyName, circData);
                    circularSuccessCount++;
                    console.log(`[Circular] SUCCESS! Found ${circRes.source} circular with ${circRes.unlockEvents.length} unlock events.`);
                } else if (circRes && circRes.bseNoticeId) {
                    circData = { found: true, ...circRes };
                    db.saveCircularData(companyName, circData);
                    console.log(`[Circular] Notice ID found: ${circRes.bseNoticeId}`);
                }
            } catch (circErr) {
                console.warn(`[Circular] Error fetching circular for ${companyName}:`, circErr.message);
            }
        } else {
            console.log(`[Circular] Already cached with ${circData.unlockEvents?.length || 0} events.`);
            circularSuccessCount++;
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
            console.log(`[CapStruct] Finding Capital Structure / RHP doc for ${companyName}...`);
            try {
                const fetchedDoc = await fetchCapitalStructureUrl(companyName);
                if (fetchedDoc) {
                    targetDoc = fetchedDoc;
                    if (fetchedDoc.toLowerCase().includes('capital_structure')) {
                        company.capitalStructureUrl = fetchedDoc;
                    } else {
                        company.rhpUrl = fetchedDoc;
                    }
                    console.log(`[CapStruct] Found doc: ${targetDoc}`);
                }
            } catch (docErr) {
                console.warn(`[CapStruct] Error finding doc for ${companyName}:`, docErr.message);
            }
        }

        const hasPreIpo = company.preIpoInvestors && company.preIpoInvestors.length > 0;
        if (!hasPreIpo && targetDoc) {
            console.log(`[PreIPO] Extracting pre-IPO investors from ${targetDoc}...`);
            try {
                const isSme = company.issueType === 'SME';
                const csRes = await extractFromCapitalStructure(companyName, targetDoc, isSme);
                if (csRes && Array.isArray(csRes.preIpoInvestors) && csRes.preIpoInvestors.length > 0) {
                    company.preIpoInvestors = csRes.preIpoInvestors;
                    if (csRes.waca) company.preIpoWaca = csRes.waca;
                    if (csRes.peerComparison) company.peerComparison = csRes.peerComparison;
                    preIpoSuccessCount++;
                    console.log(`[PreIPO] SUCCESS! Extracted ${csRes.preIpoInvestors.length} pre-IPO investors (WACA: ${csRes.waca || 'N/A'}).`);
                } else {
                    console.log(`[PreIPO] No non-promoter pre-IPO investors found in capital structure.`);
                }
            } catch (csErr) {
                console.warn(`[PreIPO] Extraction error for ${companyName}:`, csErr.message);
            }
        } else if (hasPreIpo) {
            console.log(`[PreIPO] Already has ${company.preIpoInvestors.length} pre-IPO investors.`);
            preIpoSuccessCount++;
        }

        // Save progress every company
        db.writeDB(dbData);
    }

    console.log(`\n============================================================`);
    console.log(`Batch Loading Complete!`);
    console.log(`Total September 2026 Companies: ${septCompanies.length}`);
    console.log(`Circulars active/cached: ${circularSuccessCount}`);
    console.log(`Pre-IPO records active: ${preIpoSuccessCount}`);
    console.log(`============================================================\n`);
}

run().catch(err => {
    console.error('Fatal error running September unlocks loader:', err);
});
