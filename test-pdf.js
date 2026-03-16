const axios = require('axios');
const pdfParse = require('pdf-parse');

async function testPdf() {
    try {
        const pdflink = 'https://www.chittorgarh.net/reports/anchor-investor/accord-transformer-anchor-letter.pdf';
        const response = await axios.get(pdflink, { responseType: 'arraybuffer' });
        const data = await pdfParse(response.data);
        console.log("Extracted PDF text length:", data.text.length);
        console.log("Contains Shine Star:", data.text.toLowerCase().includes('shine star'));

        // Print snippets around Shine Star
        const index = data.text.toLowerCase().indexOf('shine star');
        if (index !== -1) {
            console.log(data.text.substring(index - 50, index + 100));
        }
    } catch (e) {
        console.error("PDF extraction failed", e);
    }
}

testPdf();
