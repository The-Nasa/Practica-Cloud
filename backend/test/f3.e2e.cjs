require('reflect-metadata');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { deflateSync } = require('node:zlib');
const { readdir, writeFile, utimes } = require('node:fs/promises');
const { join } = require('node:path');
const { cleanupMedia } = require('../scripts/media-cleanup.cjs');
const { NestFactory } = require('@nestjs/core');
const { Client } = require('pg');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { configureHttp } = require('../dist/platform/configure-http');
const { OrderExpirationService } = require('../dist/modules/ordering/application/order-expiration.service');
const { DatabaseService } = require('../dist/platform/database/database.service');
const { ConfigService } = require('@nestjs/config');
let app,db,server,owner,admin,outsider,operator,customer,storeId,categoryId,zoneId,addressId,serial=0;
function api(method,path,user,body) {
  if(method==='post'&&/\/merchant\/orders\/[0-9a-f-]+\/accept$/.test(path))body={expectedVersion:0,...body};
  let call=request(server)[method](`/api/v1${path}`).set('Origin','http://localhost:5173');
  if (user) call=call.set('Cookie',user.cookie).set('X-CSRF-Token',user.csrfToken);
  return body===undefined ? call : call.send(body);
}
function ok(response,status=200) {
  assert.equal(response.status,status,JSON.stringify({code:response.body.code,message:response.body.message})); return response.body;
}
async function register(label) {
  const response=await api('post','/auth/register',null,{fullName:`Persona ${label}`,email:`f3-${++serial}@example.test`,phone:`+519${String(serial).padStart(8,'0')}`,password:'Solo-pruebas-F3-42'});
  ok(response,201); return {...response.body.user,cookie:response.headers['set-cookie'][0].split(';')[0],csrfToken:response.body.csrfToken};
}
const input=(extra={})=>({categoryId,name:`Producto ${randomUUID()}`,skuCode:`SKU-${randomUUID()}`,variantName:'Estándar',priceCents:1050,initialStock:5,...extra});
const publicImageUrl=(image)=>`/api/v1/media/${image.url.split('/').at(-1)}`;
async function product(extra={}) { return ok(await api('post',`/merchant/stores/${storeId}/products`,owner,input(extra)),201); }
async function purchase(skuId,key=randomUUID()) { return api('post','/purchases',customer,{addressId,paymentMethod:'cash',items:[{skuId,quantity:1}]}).set('Idempotency-Key',key); }
function png(width=1,height=1,noise=false) {
  const chunk=(type,data)=>{const payload=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;
    for(const byte of payload){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const size=Buffer.alloc(4);size.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,payload,checksum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const pixels=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y++){const offset=y*(width*4+1)+1;if(noise)randomBytes(width*4).copy(pixels,offset);else for(let x=0;x<width;x++){pixels[offset+x*4]=255;pixels[offset+x*4+3]=255;}}
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
before(async()=>{
  assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/quickly_test_[a-f0-9]{20}$/);
  app=await NestFactory.create(AppModule,{logger:false});configureHttp(app);await app.init();server=app.getHttpServer();
  db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
  [owner,admin,outsider,operator,customer]=await Promise.all(['owner','admin','outsider','operator','customer'].map(register));
  await db.query(`INSERT INTO identity.user_roles(user_id,role_code) VALUES($1,'admin'),($2,'merchant')`,[admin.id,outsider.id]);
  zoneId=ok(await api('post','/admin/zones',admin,{code:'f3-zone',name:'Zona F3',description:'Cobertura de pruebas',baseFeeCents:300,estimatedMinutes:20}),201).id;
  categoryId=ok(await api('get','/catalog/categories'))[0].id;
  storeId=ok(await api('post','/merchant/stores',owner,{categoryCode:'restaurantes',zoneId,name:'Tienda F3',addressText:'Calle de prueba 20',phone:owner.phone}),201).id;
  ok(await api('post',`/admin/stores/${storeId}/decisions`,admin,{decision:'approve',reason:'Validado para pruebas'}),201);
  ok(await api('put',`/merchant/stores/${storeId}/hours`,owner,{intervals:Array.from({length:7},(_,i)=>({weekday:i+1,opensAt:'00:00',closesAt:'24:00'}))}));
  ok(await api('patch',`/merchant/stores/${storeId}`,owner,{acceptingOrders:true}));
  ok(await api('put',`/merchant/stores/${storeId}/members`,owner,{email:operator.email,membershipRole:'operator'}),204);
  addressId=ok(await api('post','/me/addresses',customer,{zoneId,label:'Casa',recipientName:customer.fullName,phone:customer.phone,street:'Calle de prueba',streetNumber:'1',isDefault:true}),201).id;
},{timeout:30000});
after(async()=>{if(db)await db.end();if(app)await app.close();});

test('la tienda pública expone sólo valores comerciales persistidos y horarios reales', async () => {
  const stored = (await db.query('SELECT preparation_minutes,minimum_order_cents FROM merchant.stores WHERE id=$1', [storeId])).rows[0];
  const detail = ok(await api('get', `/stores/${storeId}`));
  assert.equal(detail.preparation_minutes, stored.preparation_minutes);
  assert.equal(detail.minimum_order_cents, Number(stored.minimum_order_cents));
  assert.equal(detail.base_fee_cents, 300);
  assert.equal(detail.rating_average, null);
  assert.equal(detail.rating_count, 0);
  assert.equal(detail.openingIntervals.length, 7);
  assert.equal(detail.address_text, 'Calle de prueba 20');
  const listed = ok(await api('get', '/stores')).find(store => store.id === storeId);
  assert.equal(listed.preparation_minutes, detail.preparation_minutes);
  assert.equal(listed.minimum_order_cents, detail.minimum_order_cents);
  assert.equal(listed.base_fee_cents, detail.base_fee_cents);
  assert.equal(listed.description, detail.description);
  ok(await api('get', '/stores/not-a-uuid'), 400);
});

test('producto, variantes y precios absolutos son visibles públicamente; edición persiste',async()=>{
  const created=await product({brand:'Marca real'});
  let detail=ok(await api('get',`/products/${created.productId}`));assert.equal(detail.brand,'Marca real');assert.equal(detail.skus[0].availableStock,5);
  detail=ok(await api('post',`/merchant/products/${created.productId}/skus`,owner,{skuCode:`ALT-${randomUUID()}`,variantName:'Grande',priceCents:2200,initialStock:2,barcode:`BC-${randomUUID()}`}),201);
  assert.equal(detail.skus.length,2);assert.deepEqual(detail.skus.map(s=>s.priceCents).sort((a,b)=>a-b),[1050,2200]);
  ok(await api('patch',`/merchant/skus/${created.skuId}`,owner,{priceCents:1150}));
  assert.equal(ok(await api('get',`/products/${created.productId}`)).skus.find(s=>s.id===created.skuId).priceCents,1150);
  assert.ok(ok(await api('get',`/merchant/stores/${storeId}/products`,owner)).items.some(p=>p.id===created.productId));
});
test('aislamiento por recurso y operador de solo lectura en productos, stock e imágenes',async()=>{
  const created=await product();
  for(const user of [outsider,operator]) {
    ok(await api('patch',`/merchant/products/${created.productId}`,user,{name:'Ajeno'}),403);
    ok(await api('post',`/merchant/products/${created.productId}/skus`,user,{skuCode:'NO',variantName:'No',priceCents:100,initialStock:0}),403);
    ok(await api('post',`/merchant/skus/${created.skuId}/stock-adjustments`,user,{quantity:1,reason:'Ajeno'}),403);
    ok(await api('post',`/merchant/products/${created.productId}/images`,user,{content:png().toString('base64'),position:0,altText:'No'}),403);
  }
  ok(await api('get',`/merchant/products/${created.productId}`,outsider),403);
  ok(await api('get',`/merchant/stores/${storeId}/inventory`,outsider),403);
  ok(await api('get',`/merchant/stores/${storeId}/products`,operator));
});
test('unicidad SKU/barcode/variante y validación rechazan entradas sin dejar productos parciales',async()=>{
  const payload=input({barcode:`BAR-${randomUUID()}`});const created=ok(await api('post',`/merchant/stores/${storeId}/products`,owner,payload),201);
  ok(await api('post',`/merchant/stores/${storeId}/products`,owner,{...payload,skuCode:`OTHER-${randomUUID()}`}),409);
  ok(await api('post',`/merchant/products/${created.productId}/skus`,owner,{skuCode:`OTHER-${randomUUID()}`,variantName:'Estándar',priceCents:200,initialStock:1}),409);
  ok(await api('post',`/merchant/stores/${storeId}/products`,owner,input({name:'   '})),400);
  ok(await api('patch',`/merchant/skus/${created.skuId}`,owner,{onHand:100}),400);
  ok(await api('get','/catalog/search?limit=1000'),400);ok(await api('get','/catalog/search?category=no-uuid'),400);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM catalog.products WHERE name=$1',[payload.name])).rows[0].n,1);
});
test('búsqueda filtra por SKU, categoría, zona, precio y disponibilidad; paginación sin repeticiones',async()=>{
  const name=`Filtro ${randomUUID()}`;await product({name,priceCents:3500,initialStock:0});await product({name,priceCents:1500,initialStock:3});
  const base=`/catalog/search?q=${encodeURIComponent(name)}&category=${categoryId}&zoneId=${zoneId}&storeId=${storeId}`;
  const first=ok(await api('get',`${base}&limit=1`));assert.equal(first.items.length,1);assert.ok(first.nextCursor);
  const second=ok(await api('get',`${base}&limit=1&cursor=${first.nextCursor}`));assert.equal(second.items.length,1);assert.notEqual(second.items[0].id,first.items[0].id);
  assert.equal(ok(await api('get',`${base}&available=true&maxPriceCents=2000`)).items.length,1);
  assert.equal(ok(await api('get',`${base}&available=false&minPriceCents=3000`)).items.length,1);
  assert.equal(ok(await api('get',base.replace(zoneId,randomUUID()))).items.length,0);
});
test('archivo lógico y desactivación de SKU impiden comprar y mantienen historial privado',async()=>{
  const created=await product();ok(await api('patch',`/merchant/products/${created.productId}`,owner,{isActive:false}));
  ok(await api('get',`/products/${created.productId}`),404);ok(await purchase(created.skuId),409);
  assert.ok(ok(await api('get',`/merchant/stores/${storeId}/products`,owner)).items.some(p=>p.id===created.productId&&!p.isActive));
  ok(await api('patch',`/merchant/products/${created.productId}`,owner,{isActive:true}));
  ok(await api('patch',`/merchant/skus/${created.skuId}`,owner,{isActive:false}));ok(await api('get',`/products/${created.productId}`),404);
  ok(await purchase(created.skuId),409);
});
test('ajuste con motivo conserva reservas, rechaza saldo negativo y registra actor/auditoría/outbox',async()=>{
  const created=await product({initialStock:2});ok(await purchase(created.skuId),201);
  ok(await api('post',`/merchant/skus/${created.skuId}/stock-adjustments`,owner,{quantity:-2,reason:'Merma'}),409);
  ok(await api('post',`/merchant/skus/${created.skuId}/stock-adjustments`,owner,{quantity:0,reason:'Sin cambio'}),400);
  ok(await api('post',`/merchant/skus/${created.skuId}/stock-adjustments`,owner,{quantity:1,reason:'  '}),400);
  const movement=ok(await api('post',`/merchant/skus/${created.skuId}/stock-adjustments`,owner,{quantity:-1,reason:'Merma verificada'}),201);
  assert.equal(movement.onHandAfter,1);assert.equal(movement.actorUserId,owner.id);
  const row=ok(await api('get',`/merchant/stores/${storeId}/inventory`,owner)).find(s=>s.skuId===created.skuId);
  assert.equal(row.reserved,1);assert.equal(row.available,0);assert.equal(row.lowStock,true);
  const movements=ok(await api('get',`/merchant/skus/${created.skuId}/movements`,owner));assert.equal(movements.length,2);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM platform.audit_entries WHERE entity_id=$1 AND action='stock.adjusted'`,[created.skuId])).rows[0].n,1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM platform.outbox_events WHERE aggregate_id=$1 AND event_type='stock.adjusted'`,[created.skuId])).rows[0].n,1);
  await assert.rejects(db.query('DELETE FROM inventory.movements WHERE id=$1',[movement.id]),{code:'23514'});
});
test('dos ajustes concurrentes y dos compras por última unidad preservan stock consistente',async()=>{
  const created=await product({initialStock:1});
  const adjustments=await Promise.all([1,2].map(()=>api('post',`/merchant/skus/${created.skuId}/stock-adjustments`,owner,{quantity:-1,reason:'Ajuste concurrente'})));
  assert.deepEqual(adjustments.map(r=>r.status).sort(),[201,409]);
  ok(await api('post',`/merchant/skus/${created.skuId}/stock-adjustments`,owner,{quantity:1,reason:'Reposición'}),201);
  const purchases=await Promise.all([purchase(created.skuId),purchase(created.skuId)]);assert.deepEqual(purchases.map(r=>r.status).sort(),[201,409]);
  assert.equal(Number((await db.query('SELECT available FROM inventory.availability WHERE sku_id=$1',[created.skuId])).rows[0].available),0);
});
test('compra contra ajuste concurrente por última unidad nunca deja disponibilidad negativa',async()=>{
  const created=await product({initialStock:1});
  const responses=await Promise.all([purchase(created.skuId),api('post',`/merchant/skus/${created.skuId}/stock-adjustments`,owner,{quantity:-1,reason:'Corrección concurrente'})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  assert.equal(Number((await db.query('SELECT available FROM inventory.availability WHERE sku_id=$1',[created.skuId])).rows[0].available),0);
});
test('precio cambiado se calcula en servidor y las líneas vendidas conservan su snapshot',async()=>{
  const created=await product();ok(await api('patch',`/merchant/skus/${created.skuId}`,owner,{priceCents:1750}));
  const bought=ok(await purchase(created.skuId),201);
  const before=(await db.query('SELECT unit_price_cents FROM ordering.order_items WHERE merchant_order_id=$1',[bought.orderId])).rows[0];assert.equal(Number(before.unit_price_cents),1750);
  ok(await api('patch',`/merchant/skus/${created.skuId}`,owner,{priceCents:1900}));
  assert.equal(Number((await db.query('SELECT unit_price_cents FROM ordering.order_items WHERE merchant_order_id=$1',[bought.orderId])).rows[0].unit_price_cents),1750);
});
test('imágenes se validan por contenido, se publican, reemplazan y eliminan con permisos',async()=>{
  const created=await product();const body={content:png().toString('base64'),altText:'Producto rojo',position:0};
  ok(await api('post',`/merchant/products/${created.productId}/images`,owner,{...body,content:Buffer.from('<svg onload="alert(1)"/>').toString('base64')}),400);
  const corrupted=png();corrupted[40]^=1;
  ok(await api('post',`/merchant/products/${created.productId}/images`,owner,{...body,content:corrupted.toString('base64')}),400);
  ok(await api('post',`/merchant/products/${created.productId}/images`,owner,{...body,content:'A'.repeat(3*1024*1024)}),413);
  const published=ok(await api('post',`/merchant/products/${created.productId}/images`,owner,body),201);assert.equal(published.images.length,1);
  const file=await request(server).get(publicImageUrl(published.images[0]));assert.equal(file.status,200);assert.equal(file.headers['content-type'],'image/png');
  assert.equal(file.headers['x-content-type-options'],'nosniff');
  const replacement=ok(await api('post',`/merchant/products/${created.productId}/images`,owner,body),201);assert.notEqual(replacement.images[0].url,published.images[0].url);
  assert.equal((await request(server).get(publicImageUrl(published.images[0]))).status,404);
  ok(await api('delete',`/merchant/products/${created.productId}/images/${replacement.images[0].id}`,outsider),403);
  ok(await api('delete',`/merchant/products/${created.productId}/images/${replacement.images[0].id}`,owner),204);
  assert.equal((await readdir(process.env.MEDIA_ROOT)).length,0);
});
test('tienda suspendida no expone productos en búsqueda, detalle ni imágenes',async()=>{
  const created=await product();const image=ok(await api('post',`/merchant/products/${created.productId}/images`,owner,{content:png().toString('base64'),altText:'Oculta',position:0}),201).images[0];
  await db.query("UPDATE merchant.stores SET status='suspended',accepting_orders=false WHERE id=$1",[storeId]);
  try {assert.equal(ok(await api('get',`/catalog/search?storeId=${storeId}`)).items.length,0);ok(await api('get',`/products/${created.productId}`),404);assert.equal((await request(server).get(publicImageUrl(image))).status,404);}
  finally {await db.query("UPDATE merchant.stores SET status='active',accepting_orders=true WHERE id=$1",[storeId]);}
});
test('limpieza de huérfanos conserva imágenes referenciadas, recientes y archivos ajenos',async()=>{
  const root=process.env.MEDIA_ROOT;const orphan=`${randomUUID()}.png`;const fresh=`${randomUUID()}.png`;const avatar=`${randomUUID()}.png`;const old=new Date(Date.now()-48*60*60*1000);
  await writeFile(join(root,orphan),png());await utimes(join(root,orphan),old,old);await writeFile(join(root,fresh),png());await writeFile(join(root,'conservar.txt'),'Archivo ajeno');
  await writeFile(join(root,avatar),png());await utimes(join(root,avatar),old,old);await db.query('UPDATE identity.users SET avatar_object_key=$2 WHERE id=$1',[owner.id,avatar]);
  const reference=(await db.query('SELECT object_key FROM catalog.product_images LIMIT 1')).rows[0].object_key;await utimes(join(root,reference),old,old);
  const preview=await cleanupMedia(db,root);assert.equal(preview.orphans,1);assert.equal(preview.removed,0);assert.ok((await readdir(root)).includes(orphan));
  const cleaned=await cleanupMedia(db,root,true);assert.equal(cleaned.removed,1);const files=await readdir(root);
  assert.equal(files.includes(orphan),false);assert.ok(files.includes(reference));assert.ok(files.includes(avatar));assert.ok(files.includes(fresh));assert.ok(files.includes('conservar.txt'));
});
test('zona desactivada oculta catálogo e imágenes sin eliminar productos',async()=>{
  const created=await product();const image=ok(await api('post',`/merchant/products/${created.productId}/images`,owner,{content:png().toString('base64'),altText:'Oculta',position:0}),201).images[0];
  await db.query('UPDATE geography.coverage_zones SET is_active=false WHERE id=$1',[zoneId]);
  try {assert.equal(ok(await api('get',`/catalog/search?storeId=${storeId}`)).items.length,0);ok(await api('get',`/products/${created.productId}`),404);assert.equal((await request(server).get(publicImageUrl(image))).status,404);}
  finally {await db.query('UPDATE geography.coverage_zones SET is_active=true WHERE id=$1',[zoneId]);}
});
test('comercio puede revisar imágenes archivadas por la ruta privada sin publicarlas ni exponerlas a terceros',async()=>{
  const created=await product();const image=ok(await api('post',`/merchant/products/${created.productId}/images`,owner,{content:png().toString('base64'),altText:'Archivo privado',position:0}),201).images[0];
  ok(await api('patch',`/merchant/products/${created.productId}`,owner,{isActive:false}));
  assert.equal((await request(server).get(publicImageUrl(image))).status,404);
  ok(await api('get',image.url.replace('/api/v1',''),owner));
  ok(await api('get',image.url.replace('/api/v1',''),outsider),403);
  ok(await api('get',image.url.replace('/api/v1','')),401);
});

test('avatar es privado por cuenta, valida contenido y no permite elegir otro usuario',async()=>{
  assert.equal(ok(await api('get','/me/avatar',customer)).url,null);
  ok(await api('put','/me/avatar',customer,{content:Buffer.from('<svg/>').toString('base64')}),400);
  ok(await api('put','/me/avatar',customer,{content:png().toString('base64'),userId:owner.id}),400);
  const first=ok(await api('put','/me/avatar',customer,{content:png().toString('base64')}));
  const bytes=await api('get',first.url.replace('/api/v1',''),customer);assert.equal(bytes.status,200);assert.equal(bytes.headers['content-type'],'image/png');
  ok(await api('get',first.url.replace('/api/v1',''),outsider),404);ok(await api('get',first.url.replace('/api/v1','')),401);
  assert.equal((await api('get','/me/avatar',customer)).headers['cache-control'],'no-store');
  const second=ok(await api('put','/me/avatar',customer,{content:png().toString('base64')}));assert.notEqual(first.url,second.url);
  ok(await api('get',first.url.replace('/api/v1',''),customer),404);
  assert.equal(ok(await api('delete','/me/avatar',customer)).url,null);ok(await api('get',second.url.replace('/api/v1',''),customer),404);
});
test('logo/banner tienen permisos de gestión, lectura de miembros y publicación condicionada al comercio',async()=>{
  for(const kind of ['logo','banner']){
    for(const user of [outsider,operator])ok(await api('put',`/merchant/stores/${storeId}/branding/${kind}`,user,{content:png().toString('base64')}),403);
    const refs=ok(await api('put',`/merchant/stores/${storeId}/branding/${kind}`,owner,{content:png().toString('base64')}));
    const key=refs[`${kind}Url`].split('/').at(-1);
    ok(await api('get',`/merchant/stores/${storeId}/branding/${kind}/${key}`,operator));
    ok(await api('get',`/merchant/stores/${storeId}/branding/${kind}/${key}`,outsider),403);
    const publicRefs=ok(await api('get',`/stores/${storeId}/branding`));const response=await request(server).get(publicRefs[`${kind}Url`]);assert.equal(response.status,200);
  }
  const detail=ok(await api('get',`/stores/${storeId}`));assert.ok(detail.logoUrl);assert.ok(detail.bannerUrl);
  ok(await api('put',`/merchant/stores/${storeId}/branding/not-a-column`,owner,{content:png().toString('base64')}),400);
  const before=ok(await api('get',`/stores/${storeId}/branding`));
  await db.query('UPDATE geography.coverage_zones SET is_active=false WHERE id=$1',[zoneId]);
  try{ok(await api('get',`/stores/${storeId}/branding`),404);assert.equal((await request(server).get(before.logoUrl)).status,404);ok(await api('get',`/merchant/stores/${storeId}/branding`,owner));}
  finally{await db.query('UPDATE geography.coverage_zones SET is_active=true WHERE id=$1',[zoneId]);}
  assert.equal(ok(await api('delete',`/merchant/stores/${storeId}/branding/logo`,owner)).logoUrl,null);assert.equal((await request(server).get(before.logoUrl)).status,404);
});
test('tienda pendiente administra su branding privado; suspensión impide nuevas cargas',async()=>{
  const pending=ok(await api('post','/merchant/stores',owner,{categoryCode:'restaurantes',zoneId,name:'Branding pendiente',addressText:'Calle de prueba 30',phone:owner.phone}),201);
  const refs=ok(await api('put',`/merchant/stores/${pending.id}/branding/logo`,owner,{content:png().toString('base64')}));
  ok(await api('get',refs.logoUrl.replace('/api/v1',''),owner));ok(await api('get',`/stores/${pending.id}/branding`),404);
  await db.query("UPDATE merchant.stores SET status='suspended' WHERE id=$1",[pending.id]);
  ok(await api('put',`/merchant/stores/${pending.id}/branding/banner`,owner,{content:png().toString('base64')}),409);
});
test('fallo de outbox revierte avatar y limpia el objeto nuevo sin borrar una referencia compartida',async()=>{
  const first=ok(await api('put','/me/avatar',customer,{content:png().toString('base64')}));
  const key=first.url.split('/').at(-1);await db.query('UPDATE identity.users SET avatar_object_key=$2 WHERE id=$1',[operator.id,key]);
  await db.query(`CREATE FUNCTION platform.fail_avatar_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type='profile.avatar_published' THEN RAISE EXCEPTION 'test rollback' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_avatar_outbox BEFORE INSERT ON platform.outbox_events FOR EACH ROW EXECUTE FUNCTION platform.fail_avatar_event()`);
  const files=(await readdir(process.env.MEDIA_ROOT)).sort();
  try{ok(await api('put','/me/avatar',customer,{content:png().toString('base64')}),409);assert.equal(ok(await api('get','/me/avatar',customer)).url,first.url);assert.deepEqual((await readdir(process.env.MEDIA_ROOT)).sort(),files);}
  finally{await db.query('DROP TRIGGER test_avatar_outbox ON platform.outbox_events; DROP FUNCTION platform.fail_avatar_event()');}
  ok(await api('delete','/me/avatar',customer));ok(await api('get',first.url.replace('/api/v1',''),operator));
  const entries=(await db.query(`SELECT payload FROM platform.outbox_events WHERE event_type IN('profile.avatar_published','merchant.branding_published')`)).rows;
  assert.ok(entries.length>0);assert.ok(entries.every(row=>!JSON.stringify(row.payload).includes(png().toString('base64'))));
});
async function ageOrder(id){await db.query(`UPDATE ordering.merchant_orders SET created_at=clock_timestamp()-interval '20 minutes',acceptance_expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1`,[id]);}
async function state(id){return(await db.query(`SELECT o.status_code,o.version,
  (SELECT count(*)::int FROM inventory.reservations r JOIN ordering.order_items i ON i.id=r.order_item_id WHERE i.merchant_order_id=o.id AND r.status='active') AS active,
  (SELECT status FROM billing.payment_attempts p WHERE p.purchase_id=o.purchase_id ORDER BY created_at LIMIT 1) AS payment
  FROM ordering.merchant_orders o WHERE o.id=$1`,[id])).rows[0];}
test('pedido nuevo guarda plazo servidor/reservas; modo manual no inventa vencimientos históricos',async()=>{
  const created=await product();const bought=ok(await purchase(created.skuId),201);assert.ok(bought.acceptanceExpiresAt);
  const expiry=(await db.query(`SELECT r.expires_at FROM inventory.reservations r JOIN ordering.order_items i ON i.id=r.order_item_id WHERE i.merchant_order_id=$1`,[bought.orderId])).rows[0].expires_at;
  assert.equal(expiry.toISOString(),bought.acceptanceExpiresAt);
  const config=app.get(ConfigService);const previous=config.get('PENDING_ORDER_TTL_MINUTES','15');config.set('PENDING_ORDER_TTL_MINUTES','0');
  let manual;try{manual=ok(await purchase(created.skuId),201);assert.equal(manual.acceptanceExpiresAt,null);}finally{config.set('PENDING_ORDER_TTL_MINUTES',previous);}
  assert.equal(await app.get(OrderExpirationService).runBatch(),0);assert.equal((await state(manual.orderId)).active,1);
});
test('vencimiento cancela efectivo y libera una sola vez; dos workers no duplican eventos',async()=>{
  const created=await product({initialStock:1});const bought=ok(await purchase(created.skuId),201);await ageOrder(bought.orderId);
  const second=new OrderExpirationService(app.get(DatabaseService),app.get(ConfigService));
  const counts=await Promise.all([app.get(OrderExpirationService).runBatch(),second.runBatch()]);assert.equal(counts.reduce((a,b)=>a+b,0),1);
  assert.deepEqual(await state(bought.orderId),{status_code:'cancelled',version:1,active:0,payment:'cancelled'});
  assert.equal(await app.get(OrderExpirationService).runBatch(),0);
  assert.equal((await db.query('SELECT on_hand FROM inventory.stock WHERE sku_id=$1',[created.skuId])).rows[0].on_hand,1);
  const audit=(await db.query(`SELECT actor_user_id FROM platform.audit_entries WHERE action='order.expired' AND entity_id=$1`,[bought.orderId])).rows;assert.deepEqual(audit,[{actor_user_id:null}]);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM ordering.order_events WHERE merchant_order_id=$1 AND status_code='cancelled'`,[bought.orderId])).rows[0].n,1);
});
test('aceptación tardía produce 409 y confirma la cancelación, incluso compitiendo con worker',async()=>{
  const created=await product();const bought=ok(await purchase(created.skuId),201);await ageOrder(bought.orderId);
  const [acceptance]=await Promise.all([api('post',`/merchant/orders/${bought.orderId}/accept`,owner),app.get(OrderExpirationService).runBatch()]);ok(acceptance,409);
  assert.deepEqual(await state(bought.orderId),{status_code:'cancelled',version:1,active:0,payment:'cancelled'});
});
test('comercio ajeno no puede usar aceptación para provocar el vencimiento de otro pedido',async()=>{
  const created=await product();const bought=ok(await purchase(created.skuId),201);await ageOrder(bought.orderId);
  ok(await api('post',`/merchant/orders/${bought.orderId}/accept`,outsider),403);assert.equal((await state(bought.orderId)).status_code,'pending');
  ok(await api('post',`/merchant/orders/${bought.orderId}/accept`,owner),409);assert.equal((await state(bought.orderId)).status_code,'cancelled');
});
test('pedido aceptado mantiene reservas al pasar su plazo de aceptación; pago en proceso exige revisión',async()=>{
  const created=await product();const accepted=ok(await purchase(created.skuId),201);ok(await api('post',`/merchant/orders/${accepted.orderId}/accept`,owner),201);await ageOrder(accepted.orderId);
  const processing=ok(await purchase(created.skuId),201);await ageOrder(processing.orderId);await db.query("UPDATE billing.payment_attempts SET status='processing' WHERE purchase_id=$1",[processing.purchaseId]);
  assert.equal(await app.get(OrderExpirationService).runBatch(),0);assert.equal((await state(accepted.orderId)).status_code,'confirmed');assert.equal((await state(accepted.orderId)).active,1);
  ok(await api('post',`/merchant/orders/${processing.orderId}/accept`,owner),409);assert.equal((await state(processing.orderId)).payment,'processing');assert.equal((await state(processing.orderId)).active,1);
});
test('rollback de auditoría/outbox conserva pedido, reservas y pago; el siguiente ciclo recupera el vencimiento',async()=>{
  const created=await product();const bought=ok(await purchase(created.skuId),201);await ageOrder(bought.orderId);
  await db.query(`CREATE FUNCTION platform.fail_expiration_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.event_type='order.expired' THEN RAISE EXCEPTION 'test rollback' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_expiration_outbox BEFORE INSERT ON platform.outbox_events FOR EACH ROW EXECUTE FUNCTION platform.fail_expiration_event()`);
  try{await assert.rejects(app.get(OrderExpirationService).runBatch(),{code:'23514'});assert.deepEqual(await state(bought.orderId),{status_code:'pending',version:0,active:1,payment:'pending'});}
  finally{await db.query('DROP TRIGGER test_expiration_outbox ON platform.outbox_events; DROP FUNCTION platform.fail_expiration_event()');}
  assert.equal(await app.get(OrderExpirationService).runBatch(),1);assert.equal((await state(bought.orderId)).status_code,'cancelled');
});
test('avatar y branding aceptan PNG válidos mayores a 100 KB y rechazan cargas superiores al límite HTTP',async()=>{
  const content=png(256,256,true).toString('base64');assert.ok(content.length>100*1024);
  ok(await api('put','/me/avatar',customer,{content}));ok(await api('put',`/merchant/stores/${storeId}/branding/logo`,owner,{content}));
  for(const path of ['/me/avatar',`/merchant/stores/${storeId}/branding/logo`])ok(await api('put',path,owner,{content:'A'.repeat(3*1024*1024)}),413);
});
test('reiniciar la API conserva referencias y objetos de avatar/logo/banner',async()=>{
  const avatar=ok(await api('get','/me/avatar',customer));const brand=ok(await api('get',`/stores/${storeId}/branding`));assert.ok(avatar.url);assert.ok(brand.logoUrl);assert.ok(brand.bannerUrl);
  await app.close();app=await NestFactory.create(AppModule,{logger:false});configureHttp(app);await app.init();server=app.getHttpServer();
  assert.equal(ok(await api('get','/me/avatar',customer)).url,avatar.url);ok(await api('get',avatar.url.replace('/api/v1',''),customer));
  assert.deepEqual(ok(await api('get',`/stores/${storeId}/branding`)),brand);assert.equal((await request(server).get(brand.logoUrl)).status,200);assert.equal((await request(server).get(brand.bannerUrl)).status,200);
});
test('el worker periódico procesa vencimientos y se detiene ordenadamente',async()=>{
  const created=await product();const bought=ok(await purchase(created.skuId),201);await ageOrder(bought.orderId);
  const run=require('node:util').promisify(require('node:child_process').execFile);
  const source=`require('reflect-metadata');const {NestFactory}=require('@nestjs/core');const {AppModule}=require('./dist/app.module');
    const {DatabaseService}=require('./dist/platform/database/database.service');
    (async()=>{const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
      try{const db=app.get(DatabaseService);const deadline=Date.now()+5000;let status;
        do{status=(await db.query('SELECT status_code FROM ordering.merchant_orders WHERE id=$1',[process.argv[1]])).rows[0].status_code;
          if(status!=='pending')break;await new Promise(resolve=>setTimeout(resolve,50));}while(Date.now()<deadline);
        console.log(JSON.stringify({status}));}finally{await app.close();}
    })().catch(()=>{process.exitCode=1;});`;
  const result=await run(process.execPath,['-e',source,bought.orderId],{cwd:join(__dirname,'..'),windowsHide:true,timeout:20000,
    env:{...process.env,NODE_ENV:'development',ORDER_EXPIRATION_INTERVAL_SECONDS:'1'}});
  assert.deepEqual(JSON.parse(result.stdout.trim()),{status:'cancelled'});assert.equal((await state(bought.orderId)).status_code,'cancelled');
});
test('comando operacional procesa un lote contra la DB aislada sin servidor HTTP',async()=>{
  const created=await product();const bought=ok(await purchase(created.skuId),201);await ageOrder(bought.orderId);
  const run=require('node:util').promisify(require('node:child_process').execFile);
  const result=await run(process.execPath,[join(__dirname,'../scripts/expire-orders.cjs'),'--limit=1'],{cwd:join(__dirname,'..'),windowsHide:true,env:{...process.env,NODE_ENV:'test'}});
  assert.deepEqual(JSON.parse(result.stdout.trim()),{expired:1});assert.equal((await state(bought.orderId)).status_code,'cancelled');
});
test('reintentar la clave de una compra vencida no crea otra compra ni vuelve a reservar',async()=>{
  const created=await product({initialStock:1});const key=randomUUID();const bought=ok(await purchase(created.skuId,key),201);await ageOrder(bought.orderId);
  assert.equal(await app.get(OrderExpirationService).runBatch(),1);assert.deepEqual(ok(await purchase(created.skuId,key),201),bought);
  assert.equal((await state(bought.orderId)).active,0);assert.equal((await db.query('SELECT available FROM inventory.availability WHERE sku_id=$1',[created.skuId])).rows[0].available,1);
});
