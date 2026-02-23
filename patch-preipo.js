const { readDB, writeDB } = require('./db');

function run() {
    const db = readDB();
    let updatedCount = 0;

    for (const company of db.companies) {
        const circularData = db.circularData[company.companyName];
        if (circularData && circularData.found && circularData.unlockEvents && circularData.unlockEvents.length > 0) {

            if (company.allotmentDate) {
                const isSME = company.issueType && company.issueType.toLowerCase().includes('sme');
                const targetMonths = isSME ? 12 : 6;

                const listingDateSrc = company.allotmentDate.adjusted || company.allotmentDate.original;
                if (listingDateSrc) {
                    const listingDate = new Date(listingDateSrc);
                    const targetDate = new Date(listingDate);
                    targetDate.setMonth(targetDate.getMonth() + targetMonths);

                    let closestEvent = null;
                    let minDiff = Infinity;

                    for (const event of circularData.unlockEvents) {
                        if (!event.date) continue;
                        const eventDate = new Date(event.date);
                        const diffDays = Math.abs((eventDate - targetDate) / (1000 * 60 * 60 * 24));

                        if (diffDays < minDiff) {
                            minDiff = diffDays;
                            closestEvent = event;
                        }
                    }

                    if (closestEvent && minDiff <= 90) { // 90 days variance allowed
                        if (!company.preIPO) {
                            company.preIPO = {};
                        }

                        // Check if we need to update
                        if (company.preIPO.expiryDate !== closestEvent.date || !company.preIPO.isAdjusted) {
                            company.preIPO.expiryDate = closestEvent.date;
                            company.preIPO.isAdjusted = true;
                            if (!company.preIPO.type) {
                                company.preIPO.type = `${isSME ? 'SME' : 'Mainboard'} Pre-IPO`;
                            }
                            updatedCount++;
                            console.log(`✅ ${company.companyName} -> Pre-IPO Updated to ${closestEvent.date} (Annexure Match)`);
                        }
                    }
                }
            }
        }
    }

    if (updatedCount > 0) {
        writeDB(db);
        console.log(`\n🎉 Retroactive Patch Complete: ${updatedCount} DB entries updated to annexure Pre-IPO accuracy.`);
    } else {
        console.log(`\n✅ DB is fully up to date. No annexure changes required.`);
    }
}

run();
