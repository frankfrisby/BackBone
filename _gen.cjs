const fs = require("fs");
const T = "src/cli/memory.js";
const current = fs.readFileSync(T, "utf-8");

// Append the rest of the file
const rest = `