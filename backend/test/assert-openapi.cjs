const assert = require('node:assert/strict');
const spec = require('../openapi.json');

// Independent wire validation against the exported contract, including newly documented mutations.
function validate(schema, value, location) {
  if (schema.$ref) schema = schema.$ref.split('/').slice(1).reduce((node, key) => node[key], spec);
  if (value === null && schema.nullable) return;
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(candidate => { try { validate(candidate, value, location); return true; } catch { return false; } });
    assert.equal(matches.length, 1, location + ': oneOf'); return;
  }
  for (const part of schema.allOf || []) validate(part, value, location);
  if (schema.enum) assert.ok(schema.enum.includes(value), location + ': enum');
  if (schema.type === 'array') {
    assert.ok(Array.isArray(value), location + ': array');
    value.forEach((item, index) => validate(schema.items, item, location + '[' + index + ']'));
  } else if (schema.type === 'object') {
    assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), location + ': object');
    for (const key of schema.required || []) assert.ok(Object.hasOwn(value, key), location + '.' + key + ': required');
    for (const [key, child] of Object.entries(schema.properties || {})) if (Object.hasOwn(value, key)) validate(child, value[key], location + '.' + key);
  } else if (schema.type === 'integer') assert.ok(Number.isSafeInteger(value), location + ': integer');
  else if (schema.type === 'number') assert.ok(typeof value === 'number' && Number.isFinite(value), location + ': number');
  else if (schema.type) assert.equal(typeof value, schema.type, location + ': ' + schema.type);
  if (schema.pattern && typeof value === 'string') assert.match(value, new RegExp(schema.pattern), location);
  if (schema.format === 'date-time' && typeof value === 'string') assert.ok(Number.isFinite(Date.parse(value)), location + ': date-time');
}
module.exports = function assertOpenApi(response) {
  if (response.status < 200 || response.status >= 300 || response.status === 204) return;
  const url = new URL(response.request.url, 'http://localhost');
  const entry = Object.entries(spec.paths).find(([template]) => new RegExp('^' + template.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(url.pathname));
  assert.ok(entry, 'Ruta ausente de OpenAPI: ' + url.pathname);
  const operation = entry[1][response.request.method.toLowerCase()];
  const schema = operation?.responses?.[String(response.status)]?.content?.['application/json']?.schema;
  assert.ok(schema, 'Respuesta JSON sin schema: ' + operation?.operationId);
  validate(schema, response.body, operation.operationId);
};
