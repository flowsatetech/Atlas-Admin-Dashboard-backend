const fs = require('fs');
const path = require('path');

const swaggerSpec = require('../functions/docs/swagger');

const outputPath = path.join(__dirname, '../bruno-openapi.json');
fs.writeFileSync(outputPath, `${JSON.stringify(swaggerSpec, null, 2)}\n`, 'utf8');

console.log(`Wrote OpenAPI spec to ${outputPath}`);
