const fs = require('fs');
const pdf = require('pdf-parse');
const { parseLockInData } = require('./circular-scraper');

async function doPdf(path, name) {
    const buf = fs.readFileSync(path);
    const data = await pdf(buf);
    fs.writeFileSync(`debug_real_${name}.txt`, data.text);
    console.log(`-- ${name} --`);
    console.log(`Text Length: ${data.text.length}`);
    const res = await parseLockInData(buf, 'BSE');
    console.log(JSON.stringify(res, null, 2));
}

(async () => {
    await doPdf('test_exato_annex1.pdf', 'exato');
    await doPdf('test_luxury_annex1.pdf', 'luxury');
})();
