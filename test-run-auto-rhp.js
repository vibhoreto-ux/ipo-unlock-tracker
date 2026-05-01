const { autoFetchMissingRHP } = require('./auto-rhp');

(async () => {
    console.log("Starting forced Auto-RHP execution...");
    await autoFetchMissingRHP();
    console.log("Finished.");
})();
