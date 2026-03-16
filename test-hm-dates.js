const fs = require('fs');
const pdf = require('pdf-parse');
async function test() {
    const data = await pdf(fs.readFileSync('/tmp/hm_electro.pdf'));
    let text = data.text;
    const idx = text.indexOf('2646400');
    console.log("Raw layout:", JSON.stringify(text.substring(Math.max(0, idx - 100), idx + 100)));
}
test();
