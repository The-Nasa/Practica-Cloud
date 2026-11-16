const fs = require('fs');
const path = require('path');

const tsPath = path.resolve(__dirname, '../../Frontend-Quickly/src/mocks/initialData.ts');
const raw = fs.readFileSync(tsPath, 'utf8');

// Simple regex parser to extract zones, users, merchants, products, couriers, addresses
function extractArray(content, varName) {
  const startPattern = new RegExp(`export const ${varName}:\\s*\\w+\\[\\]\\s*=\\s*\\[`);
  const match = content.match(startPattern);
  if (!match) return [];
  const startIndex = match.index + match[0].length - 1; // points to '['
  
  // Find matching closing bracket
  let depth = 0;
  let inString = null;
  let inComment = false;
  let inLineComment = false;
  let endIndex = -1;

  for (let i = startIndex; i < content.length; i++) {
    const ch = content[i];
    const prev = content[i - 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inComment) {
      if (prev === '*' && ch === '/') inComment = false;
      continue;
    }
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }

    if (ch === '/' && content[i + 1] === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && content[i + 1] === '*') {
      inComment = true;
      i++;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) return [];
  const arrayText = content.slice(startIndex, endIndex + 1);
  // evaluate safely using Function
  try {
    const fn = new Function(`return ${arrayText};`);
    return fn();
  } catch (err) {
    console.error(`Error evaluating ${varName}:`, err.message);
    return [];
  }
}

const zones = extractArray(raw, 'INITIAL_ZONES');
const users = extractArray(raw, 'INITIAL_USERS');
const merchants = extractArray(raw, 'INITIAL_MERCHANTS');
const products = extractArray(raw, 'INITIAL_PRODUCTS');
const couriers = extractArray(raw, 'INITIAL_COURIERS');
const addresses = extractArray(raw, 'INITIAL_ADDRESSES');

console.log('Extracted successfully:');
console.log('- Zones:', zones.length);
console.log('- Users:', users.length);
console.log('- Merchants:', merchants.length);
console.log('- Products:', products.length);
console.log('- Couriers:', couriers.length);
console.log('- Addresses:', addresses.length);

const outData = {
  zones,
  users,
  merchants,
  products,
  couriers,
  addresses,
};

fs.writeFileSync(path.join(__dirname, 'seed-data.json'), JSON.stringify(outData, null, 2), 'utf8');
console.log('Saved to backend/scripts/seed-data.json');
