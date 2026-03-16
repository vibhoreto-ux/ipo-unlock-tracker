const fs = require('fs');
const pdf = require('pdf-parse');
async function debug() {
    const data = await pdf(fs.readFileSync('/tmp/solarium.pdf'));
    const normalized = data.text.replace(/\n\s+\n/g, '\n\n').replace(/[ \t]+/g, ' ').replace(/\r/g, '');
    console.log("=== NORMALIZED ===");
    console.log(normalized);
}
debug();
