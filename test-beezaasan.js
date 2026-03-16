const fs = require('fs');
const pdf = require('pdf-parse');
async function run() {
  try {
    const buf = fs.readFileSync('/tmp/beezaasan.pdf');
    const d = await pdf(buf);
    console.log("TEXT START:\n", d.text, "\nTEXT END");
  } catch (err) {
    console.error(err);
  }
}
run();
