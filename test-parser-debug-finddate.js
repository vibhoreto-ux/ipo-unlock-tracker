const fs = require('fs');
let code = fs.readFileSync('circular-scraper.js', 'utf8');

// intercept findDateNear
code = code.replace(
    'function findDateNear(text, startIndex, range) {',
    'function findDateNear(text, startIndex, range) {\n  const res = findDateNearImpl(text, startIndex, range);\n  console.log("findDateNear input idx=" + startIndex + " res=" + res);\n  return res;\n}\nfunction findDateNearImpl(text, startIndex, range) {'
);

fs.writeFileSync('circular-scraper-temp2.js', code);
