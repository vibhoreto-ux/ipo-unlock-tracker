const { parseBSEDate } = require('./circular-scraper');

function findDateNear(text, startIndex, range) {
    let chunk = text.substring(startIndex, startIndex + Math.min(range, 55));
    const dateRegex = /(\d{1,2})-(\w{3,}|\d{1,2})-(\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
    let match;
    const dates = [];
    while ((match = dateRegex.exec(chunk)) !== null) {
        // Just mocking the parseBSEDate logic:
        console.log("Matched string:", match[0]);
        const parts = match[0].split('-');
        let d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00.000Z`);
        console.log("Parsed Date object:", d.toISOString());
    }
}

findDateNear("707240017072400F,L28-02-2026Demat", 0, 50);
