require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { writeFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { AppModule } = require('../dist/app.module');
const { createOpenApiDocument } = require('../dist/platform/openapi');

(async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const target = path.join(__dirname, '../openapi.json');
    const content = JSON.stringify(createOpenApiDocument(app), null, 2) + '\n';
    if (process.argv.includes('--check')) {
      if (readFileSync(target, 'utf8') !== content) throw new Error('Contrato OpenAPI desactualizado');
      console.log('Contrato OpenAPI actualizado.');
    } else {
      writeFileSync(target, content);
      console.log('Contrato OpenAPI exportado sin conectar ni modificar la DB.');
    }
  } finally { await app.close(); }
})().catch(() => { console.error('No se pudo exportar OpenAPI. Compile primero.'); process.exitCode = 1; });
