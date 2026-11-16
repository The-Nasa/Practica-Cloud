require('reflect-metadata');
const {test,before,after,mock}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {deflateSync}=require('node:zlib');
const fs=require('node:fs/promises');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {NestFactory}=require('@nestjs/core');
const {Logger}=require('@nestjs/common');
const {Client}=require('pg');
const request=require('supertest');
const {AppModule}=require('../dist/app.module');
const {configureHttp}=require('../dist/platform/configure-http');
const {DatabaseService}=require('../dist/platform/database/database.service');
const {createBackup,verifyBackup,restoreBackup}=require('../scripts/backup.cjs');
let app,db,server,customer,admin,owner,product,addressId,serial=0,avatarUrl,sourceImage;
const sourceUrl=process.env.DATABASE_URL,sourceMedia=process.env.MEDIA_ROOT;
function api(method,route,user,body){let call=request(server)[method](`/api/v1${route}`).set('Origin','http://localhost:5173');if(user)call=call.set('Cookie',user.cookie).set('X-CSRF-Token',user.csrfToken);return body===undefined?call:call.send(body);}
function ok(r,status=200){assert.equal(r.status,status,JSON.stringify({code:r.body.code,message:r.body.message}));return r.body;}
async function register(label){const email=`f8-${++serial}@example.test`;const r=await api('post','/auth/register',null,{fullName:`Persona ${label}`,email,phone:`+519${String(serial).padStart(8,'0')}`,password:'Solo-pruebas-F8-42'});ok(r,201);return{...r.body.user,email,cookie:r.headers['set-cookie'][0].split(';')[0],csrfToken:r.body.csrfToken};}
const purchaseBody=()=>({addressId,paymentMethod:'cash',items:[{skuId:product.skuId,quantity:1}]});
function png(){const chunk=(type,data)=>{const bytes=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,bytes,sum]);};const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);}
before(async()=>{
 assert.match(new URL(sourceUrl).pathname,/^\/quickly_test_[a-f0-9]{20}$/);app=await NestFactory.create(AppModule,{logger:false});configureHttp(app);await app.listen(0,'127.0.0.1');server=app.getHttpServer();db=new Client({connectionString:sourceUrl});await db.connect();
 customer=await register('Cliente');admin=await register('Admin');owner=await register('Tienda');await db.query("INSERT INTO identity.user_roles(user_id,role_code) VALUES($1,'admin')",[admin.id]);
 const zone=ok(await api('post','/admin/zones',admin,{code:'f8-zone',name:'Zona F8',description:'Pruebas aisladas',baseFeeCents:300,estimatedMinutes:20}),201);
 const category=ok(await api('get','/catalog/categories'))[0];const store=ok(await api('post','/merchant/stores',owner,{categoryCode:'restaurantes',zoneId:zone.id,name:'Tienda F8',addressText:'Calle pruebas 10',phone:owner.phone}),201);
 ok(await api('post',`/admin/stores/${store.id}/decisions`,admin,{decision:'approve',reason:'Verificación F8'}),201);ok(await api('put',`/merchant/stores/${store.id}/hours`,owner,{intervals:Array.from({length:7},(_,i)=>({weekday:i+1,opensAt:'00:00',closesAt:'24:00'}))}));
 product=ok(await api('post',`/merchant/stores/${store.id}/products`,owner,{categoryId:category.id,name:'Producto F8',skuCode:'F8-SKU',variantName:'Unidad',priceCents:1050,initialStock:100}),201);
 addressId=ok(await api('post','/me/addresses',customer,{zoneId:zone.id,label:'Casa',recipientName:customer.fullName,phone:customer.phone,street:'Destino F8',streetNumber:'10',isDefault:true}),201).id;
 avatarUrl=ok(await api('put','/me/avatar',customer,{content:png().toString('base64')})).url;sourceImage=(await request(server).get(avatarUrl).set('Cookie',customer.cookie)).body;
},{timeout:30000});
after(async()=>{mock.restoreAll();if(app)await app.close();if(db)await db.end();process.env.DATABASE_URL=sourceUrl;process.env.MEDIA_ROOT=sourceMedia;});

test('F8: liveness no depende de PostgreSQL y readiness falla sin filtrar la causa privada',async()=>{
 ok(await api('get','/health/live'));ok(await api('get','/health/ready'));
 const mocked=mock.method(app.get(DatabaseService),'query',async()=>{throw new Error('private-database-password');});
 try{ok(await api('get','/health/live'));const r=await api('get','/health/ready');ok(r,503);assert.ok(!JSON.stringify(r.body).includes('private-database-password'));}finally{mocked.mock.restore();}
});
test('F8: monitoreo restringido, sin caché y con avisos calculados desde SQL',async()=>{
 ok(await api('get','/admin/operations'),401);ok(await api('get','/admin/operations',customer),403);
 await db.query(`INSERT INTO platform.outbox_events(event_type,aggregate_type,aggregate_id,payload,created_at,attempts)
  VALUES('test.lag','user',$1,'{}',now()-interval '10 minutes',6)`,[customer.id]);
 const r=await api('get','/admin/operations',admin);const body=ok(r);assert.equal(r.headers['cache-control'],'no-store');assert.ok(body.alerts.includes('OUTBOX_LAG'));assert.ok(body.alerts.includes('OUTBOX_RETRIES'));assert.ok(body.poolTotal>=1);assert.ok(!('password' in body));
});
test('F8: cabeceras y log de acceso no incluyen query, cookies, cuerpo ni identificadores de recurso',async()=>{
 const messages=[];const previous=process.env.HTTP_ACCESS_LOG;process.env.HTTP_ACCESS_LOG='true';const logger=mock.method(Logger.prototype,'log',message=>messages.push(message));
 try{const r=await api('get','/me/orders?secret=private-marker',customer);assert.equal(r.headers['x-content-type-options'],'nosniff');assert.equal(r.headers['x-frame-options'],'DENY');assert.equal(r.headers['x-powered-by'],undefined);assert.ok(messages.some(m=>typeof m==='string'&&m.includes('http_request')));const logs=messages.join(' ');assert.ok(!logs.includes('private-marker'));assert.ok(!logs.includes(customer.cookie));assert.ok(!logs.includes(customer.email));}finally{logger.mock.restore();if(previous===undefined)delete process.env.HTTP_ACCESS_LOG;else process.env.HTTP_ACCESS_LOG=previous;}
});
test('F8: carga acotada de lecturas concurrentes conserva sesión y entrega resultados SQL válidos',async t=>{
 const durations=[];for(let batch=0;batch<6;batch++)await Promise.all(Array.from({length:10},async(_,i)=>{const start=performance.now();const r=await api('get',i%2?'/me/orders':'/health/ready',customer);ok(r);durations.push(performance.now()-start);}));durations.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({requests:durations.length,concurrency:10,p95Ms:Math.round(durations[Math.ceil(durations.length*.95)-1]),maxMs:Math.round(durations.at(-1))}));
},{timeout:30000});
test('F8: ráfaga concurrente de confirmaciones con misma clave solo crea y reserva una compra',async()=>{
 const key=randomUUID();const before=Number((await db.query('SELECT count(*) AS n FROM ordering.purchases')).rows[0].n);
 const responses=await Promise.all(Array.from({length:10},()=>api('post','/purchases',customer,purchaseBody()).set('Idempotency-Key',key)));
 const bodies=responses.map(r=>ok(r,201));assert.equal(new Set(bodies.map(b=>b.purchaseId)).size,1);assert.equal(Number((await db.query('SELECT count(*) AS n FROM ordering.purchases')).rows[0].n),before+1);
},{timeout:30000});
test('F8: respaldo requiere mantenimiento y un destino nuevo',async()=>{
 await assert.rejects(createBackup({connectionString:sourceUrl,container:'quickly-postgres-test',mediaRoot:sourceMedia,outputDir:path.join(sourceMedia,'invalid')}),/MAINTENANCE_REQUIRED/);
});
test('F8: respaldo DB+imágenes se restaura, invalida sesiones y permite nueva compra sin tocar origen',async t=>{
 const root=await fs.mkdtemp(path.join(tmpdir(),'quickly-f8-'));let restored,restoredApp;const started=performance.now();
 try{
  await app.close();app=undefined;const directory=path.join(root,'backup');const container=process.env.TEST_POSTGRES_CONTAINER||'quickly-postgres-test';
  await createBackup({connectionString:sourceUrl,container,mediaRoot:sourceMedia,outputDir:directory,maintenanceConfirmed:true});const manifest=await verifyBackup(directory);assert.equal(manifest.objects.length,1);
  const bytes=await fs.readFile(path.join(directory,'media',manifest.objects[0].key));assert.deepEqual(bytes,sourceImage);
  const original=await fs.readFile(path.join(directory,'database.dump'));await fs.writeFile(path.join(directory,'database.dump'),Buffer.concat([original,Buffer.from('corrupt')]));
  await assert.rejects(verifyBackup(directory),/CHECKSUM/);await fs.writeFile(path.join(directory,'database.dump'),original);
  const sourceCount=Number((await db.query('SELECT count(*) AS n FROM ordering.purchases')).rows[0].n);
  restored=await restoreBackup({directory,adminUrl:process.env.TEST_DATABASE_URL,container,targetMediaRoot:path.join(root,'restored-media')});
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname=`/${restored.database}`;process.env.DATABASE_URL=url.toString();process.env.MEDIA_ROOT=restored.mediaRoot;
  restoredApp=await NestFactory.create(AppModule,{logger:false});configureHttp(restoredApp);await restoredApp.init();const restoredServer=restoredApp.getHttpServer();
  assert.equal((await request(restoredServer).get('/api/v1/me').set('Cookie',customer.cookie)).status,401);
  const login=await request(restoredServer).post('/api/v1/auth/login').set('Origin','http://localhost:5173').send({email:customer.email,password:'Solo-pruebas-F8-42'});ok(login);const cookie=login.headers['set-cookie'][0].split(';')[0];
  const avatar=await request(restoredServer).get(avatarUrl).set('Cookie',cookie);ok(avatar);assert.deepEqual(avatar.body,sourceImage);
  const created=await request(restoredServer).post('/api/v1/purchases').set('Origin','http://localhost:5173').set('Cookie',cookie).set('X-CSRF-Token',login.body.csrfToken).set('Idempotency-Key',randomUUID()).send(purchaseBody());ok(created,201);
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM ordering.purchases')).rows[0].n),sourceCount);
  t.diagnostic(JSON.stringify({restoreAndOperationMs:Math.round(performance.now()-started),objects:restored.objects}));
 }finally{
  if(restoredApp)await restoredApp.close();process.env.DATABASE_URL=sourceUrl;process.env.MEDIA_ROOT=sourceMedia;
  if(restored){assert.match(restored.database,/^quickly_restore_[a-f0-9]{20}$/);const adminDb=new Client({connectionString:process.env.TEST_DATABASE_URL});try{await adminDb.connect();await adminDb.query(`DROP DATABASE "${restored.database}" WITH (FORCE)`);}finally{await adminDb.end();}}
  assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert.match(path.basename(root),/^quickly-f8-[A-Za-z0-9]+$/);await fs.rm(root,{recursive:true,force:true});
 }
},{timeout:120000});
