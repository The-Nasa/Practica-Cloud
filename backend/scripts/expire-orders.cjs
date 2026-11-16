require('reflect-metadata');
// A one-shot run never also starts the in-process interval.
process.env.ORDER_EXPIRATION_INTERVAL_SECONDS='0';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { OrderExpirationService } = require('../dist/modules/ordering/application/order-expiration.service');
(async()=>{const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
  try {const argument=process.argv.find(value=>value.startsWith('--limit='));const limit=argument ? Number(argument.slice(8)) : 50;
    console.log(JSON.stringify({expired:await app.get(OrderExpirationService).runBatch(limit)}));}
  finally{await app.close();}
})().catch(()=>{console.error('No se pudo procesar el vencimiento. No se imprimen datos de conexión.');process.exitCode=1;});
