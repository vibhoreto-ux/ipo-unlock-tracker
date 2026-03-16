const fs = require('fs');
const pdf = require('pdf-parse');

async function test() {
    const data = await pdf(fs.readFileSync('/tmp/shanmuga.pdf'));
    const norm = data.text.replace(/\s+/g, ' ');
    const isNSEFormat = norm.includes('Lock in up to') || norm.includes('Lock in upto');
    console.log(`isNSEFormat: ${isNSEFormat}`);
}
test();
