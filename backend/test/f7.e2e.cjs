require('reflect-metadata');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {NestFactory}=require('@nestjs/core');
const {Client}=require('pg');
const request=require('supertest');
const {AppModule}=require('../dist/app.module');
const {configureHttp}=require('../dist/platform/configure-http');
const {OrderExpirationService}=require('../dist/modules/ordering/application/order-expiration.service');
let app,db,server,customer,other,owner,owner2,admin,courier,zoneId,categoryId,addressId,storeA,storeB,seq=0;
function api(method,path,user,body){let call=request(server)[method](`/api/v1${path}`).set('Origin','http://localhost:5173');if(user)call=call.set('Cookie',user.cookie).set('X-CSRF-Token',user.csrfToken);return body===undefined?call:call.send(body);}
function ok(r,status=200){assert.equal(r.status,status,JSON.stringify({code:r.body.code,message:r.body.message}));return r.body;}
async function register(label){const r=await api('post','/auth/register',null,{fullName:`Persona ${label}`,email:`${randomUUID()}@example.test`,phone:`+519${String(++seq).padStart(8,'0')}`,password:'Solo-pruebas-F7-42'});ok(r,201);return{...r.body.user,cookie:r.headers['set-cookie'][0].split(';')[0],csrfToken:r.body.csrfToken};}
async function store(user,name){const id=ok(await api('post','/merchant/stores',user,{categoryCode:'restaurantes',zoneId,name,addressText:'Calle tienda 10',phone:user.phone}),201).id;ok(await api('post',`/admin/stores/${id}/decisions`,admin,{decision:'approve',reason:'Verificación F7'}),201);ok(await api('put',`/merchant/stores/${id}/hours`,user,{intervals:Array.from({length:7},(_,i)=>({weekday:i+1,opensAt:'00:00',closesAt:'24:00'}))}));return id;}
async function product(storeId,user,stock=10){return ok(await api('post',`/merchant/stores/${storeId}/products`,user,{categoryId,name:`Producto ${randomUUID()}`,skuCode:`F7-${randomUUID()}`,variantName:'Unidad',priceCents:1050,initialStock:stock}),201);}
async function body(stock=10){const a=await product(storeA,owner,stock);const b=await product(storeB,owner2,stock);return{addressId,paymentMethod:'cash',items:[{skuId:a.skuId,quantity:1},{skuId:b.skuId,quantity:1}]};}
const buy=(payload,key=randomUUID(),user=customer)=>api('post','/checkout/groups',user,payload).set('Idempotency-Key',key);
async function counts(){return(await db.query(`SELECT (SELECT count(*) FROM ordering.checkout_groups) AS groups,
 (SELECT count(*) FROM ordering.purchases) AS purchases,(SELECT count(*) FROM inventory.reservations) AS reservations,
 (SELECT count(*) FROM billing.payment_attempts) AS payments,(SELECT count(*) FROM platform.idempotency_keys) AS keys,
 (SELECT count(*) FROM platform.outbox_events) AS events`)).rows[0];}
before(async()=>{
 assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/quickly_test_[a-f0-9]{20}$/);
 app=await NestFactory.create(AppModule,{logger:false});configureHttp(app);await app.init();server=app.getHttpServer();db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
 [customer,other,owner,owner2,admin,courier]=await Promise.all(['cliente','otro','tienda A','tienda B','admin','reparto'].map(register));
 await db.query("INSERT INTO identity.user_roles(user_id,role_code) VALUES($1,'admin')",[admin.id]);
 zoneId=ok(await api('post','/admin/zones',admin,{code:'f7-zone',name:'Zona F7',description:'Zona de pruebas',baseFeeCents:300,estimatedMinutes:20}),201).id;
 categoryId=ok(await api('get','/catalog/categories'))[0].id;storeA=await store(owner,'Tienda A');storeB=await store(owner2,'Tienda B');
 addressId=ok(await api('post','/me/addresses',customer,{zoneId,label:'Casa',recipientName:customer.fullName,phone:customer.phone,street:'Destino F7',streetNumber:'10',isDefault:true}),201).id;
 ok(await api('put','/courier/profile',courier,{vehicleType:'bicycle',zoneId}));ok(await api('post',`/admin/couriers/${courier.id}/decisions`,admin,{decision:'approve',reason:'Reparto F7 habilitado'}),201);ok(await api('patch','/courier/profile/availability',courier,{isOnline:true}));
},{timeout:30000});
after(async()=>{if(db)await db.end();if(app)await app.close();});

test('F7: cotización desglosa productos, mínimo y envío por tienda sin reservar',async()=>{
 const payload=await body();const before=await counts();const q=ok(await api('post','/checkout/groups/quote',customer,payload));
 assert.equal(q.stores.length,2);assert.equal(q.subtotalCents,2100);assert.equal(q.deliveryFeeCents,600);assert.equal(q.totalCents,2700);
 assert.ok(q.stores.every(s=>s.totalCents===1350&&s.cashTenderCents===1350));assert.deepEqual(await counts(),before);
 ok(await api('post','/checkout/groups/quote',customer,{...payload,cashTenderCents:5000}),400);
});
test('F7: confirmación concurrente idéntica crea un grupo y dos compras/pagos sin duplicados',async()=>{
 const payload=await body();const key=randomUUID();const before=await counts();const results=await Promise.all([buy(payload,key),buy(payload,key)]);const a=ok(results[0],201),b=ok(results[1],201);assert.deepEqual(a,b);assert.equal(a.orders.length,2);
 const after=await counts();assert.equal(Number(after.groups)-Number(before.groups),1);assert.equal(Number(after.purchases)-Number(before.purchases),2);assert.equal(Number(after.payments)-Number(before.payments),2);
 assert.equal(new Set(a.orders.map(o=>o.purchaseId)).size,2);assert.equal(a.totalCents,2700);
 const live=ok(await api('get',`/me/group-checkout-attempts/${key}`,customer));assert.equal(live.id,a.id);assert.equal(live.orders.length,2);
 ok(await buy({...payload,items:[{...payload.items[0],quantity:2},payload.items[1]]},key),409);
});
test('F7: acceso propio y aislamiento comercial por recurso; no hay búsqueda de confirmaciones ajenas',async()=>{
 const key=randomUUID();const group=ok(await buy(await body(),key),201);
 ok(await api('get',`/me/checkout-groups/${group.id}`,other),404);ok(await api('get',`/me/checkout-groups/${group.id}`,owner),404);
 ok(await api('get',`/me/checkout-groups/${group.id}`),401);ok(await api('get',`/me/group-checkout-attempts/${key}`,other),404);
 const a=group.orders.find(o=>o.storeId===storeA);ok(await api('get',`/orders/${a.orderId}`,owner));ok(await api('get',`/orders/${a.orderId}`,owner2),404);
 assert.equal(ok(await api('get',`/orders/${a.orderId}`,customer)).checkoutGroupId,group.id);
});
test('F7: total obsoleto, dirección ajena y tienda pausada revierten toda la confirmación',async()=>{
 const payload=await body();let before=await counts();ok(await buy({...payload,expectedTotalCents:1}),409);assert.deepEqual(await counts(),before);
 ok(await buy(payload,randomUUID(),other),404);assert.deepEqual(await counts(),before);
 ok(await api('patch',`/merchant/stores/${storeB}`,owner2,{acceptingOrders:false}));before=await counts();ok(await buy(payload),409);assert.deepEqual(await counts(),before);
 ok(await api('patch',`/merchant/stores/${storeB}`,owner2,{acceptingOrders:true}));
});
test('F7: falta de stock y mínimos se comprueban por tienda sin creación parcial',async()=>{
 const payload=await body(0);let before=await counts();ok(await buy(payload),409);assert.deepEqual(await counts(),before);
 const stocked=await body();ok(await api('patch',`/merchant/stores/${storeB}`,owner2,{minimumOrderCents:2000}));before=await counts();ok(await buy(stocked),409);assert.deepEqual(await counts(),before);
 ok(await api('patch',`/merchant/stores/${storeB}`,owner2,{minimumOrderCents:0}));
});
test('F7: dos confirmaciones disputando el último SKU no reservan parcialmente las demás tiendas',async()=>{
 const payload=await body(1);const before=await counts();const results=await Promise.all([buy(payload),buy({...payload,items:[...payload.items].reverse()})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const after=await counts();assert.equal(Number(after.groups)-Number(before.groups),1);assert.equal(Number(after.reservations)-Number(before.reservations),2);
});
test('F7: fallo de auditoría del grupo revierte compras, reservas, claves y pagos de todas las tiendas',async()=>{
 const payload=await body();const before=await counts();
 await db.query(`CREATE FUNCTION platform.fail_f7_checkout() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='checkout.created' THEN RAISE EXCEPTION 'forced rollback'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER f7_checkout_failure BEFORE INSERT ON platform.audit_entries FOR EACH ROW EXECUTE FUNCTION platform.fail_f7_checkout()`);
 try{ok(await buy(payload),500);assert.deepEqual(await counts(),before);}finally{await db.query('DROP TRIGGER f7_checkout_failure ON platform.audit_entries;DROP FUNCTION platform.fail_f7_checkout()');}
});
test('F7: cancelar una tienda y entregar/cobrar otra mantiene cobros e inventario independientes',async()=>{
 const group=ok(await buy(await body()),201);const a=group.orders.find(o=>o.storeId===storeA),b=group.orders.find(o=>o.storeId===storeB);
 ok(await api('post',`/orders/${a.orderId}/cancellations`,customer,{expectedVersion:0,reason:'Solo cancelar la primera tienda'}),201);
 let version=0;for(const action of ['accept','start-preparation','mark-ready'])ok(await api('post',`/merchant/orders/${b.orderId}/${action}`,owner2,{expectedVersion:version++}),201);
 const assignment=ok(await api('post',`/courier/orders/${b.orderId}/claim`,courier,{expectedVersion:3}),201);
 ok(await api('post',`/courier/assignments/${assignment.id}/pickup`,courier,{expectedVersion:0}),201);
 ok(await api('post',`/courier/assignments/${assignment.id}/deliver`,courier,{expectedVersion:1,cashReceivedCents:2000}),201);
 const live=ok(await api('get',`/me/checkout-groups/${group.id}`,customer));assert.equal(live.orders.find(o=>o.orderId===a.orderId).paymentStatus,'cancelled');assert.equal(live.orders.find(o=>o.orderId===b.orderId).paymentStatus,'succeeded');
 assert.equal(Number((await db.query(`SELECT amount_cents FROM billing.payment_attempts WHERE purchase_id=$1`,[b.purchaseId])).rows[0].amount_cents),1350);
});
test('F7: vencimiento de una tienda conserva la otra y recuperar devuelve estados actuales',async()=>{
 const key=randomUUID();const group=ok(await buy(await body(),key),201);const [a,b]=group.orders;
 await db.query("UPDATE ordering.merchant_orders SET created_at=clock_timestamp()-interval '20 minutes',acceptance_expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[a.orderId]);
 await app.get(OrderExpirationService).runBatch();const live=ok(await api('get',`/me/group-checkout-attempts/${key}`,customer));
 assert.equal(live.orders.find(o=>o.orderId===a.orderId).status,'cancelled');assert.equal(live.orders.find(o=>o.orderId===b.orderId).status,'pending');assert.equal(live.orders.find(o=>o.orderId===b.orderId).paymentStatus,'pending');
});
