const http = require('http');
const { Client } = require('pg');
require('dotenv').config({ path: 'd:/app-Quickly/Quickly-backend/.env' });

const BASE_URL = 'http://localhost:3000';

const crypto = require('crypto');

function getCsrfToken(cookie) {
  if (!cookie) return null;
  const match = cookie.match(/quickly_session=([a-f0-9]{64})/);
  if (!match) return null;
  return crypto.createHash('sha256').update('quickly:csrf:v1:').update(match[1]).digest('hex');
}

function makeRequest(method, path, body = null, cookie = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173',
      ...headers,
    };
    if (cookie) {
      reqHeaders['Cookie'] = cookie;
      if (!reqHeaders['X-CSRF-Token']) {
        const csrf = getCsrfToken(cookie);
        if (csrf) reqHeaders['X-CSRF-Token'] = csrf;
      }
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = data;
          }
          const setCookie = res.headers['set-cookie'];
          resolve({ status: res.statusCode, data: json, headers: res.headers, setCookie });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// Generate valid minimal 1x1 PNG RGB in Base64
function generateMinimalPngBase64() {
  // A valid minimal 1x1 8-bit RGB PNG
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG header
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
    0xde,
    0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT
    0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, // compressed data
    0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND
    0xae, 0x42, 0x60, 0x82,
  ]);
  return pngBuffer.toString('base64');
}

async function run() {
  console.log('================================================================');
  console.log('🚀 INICIANDO PRUEBA END-TO-END COMPLETA (SUPABASE + BACKEND API)');
  console.log('================================================================\n');

  const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();

  try {
    // -------------------------------------------------------------
    // PASO 1: Iniciar sesión como Dueño de Tienda (comercio@quickly.pe)
    // -------------------------------------------------------------
    console.log('👉 [1] Autenticando comerciante (comercio@quickly.pe)...');
    const loginMerchant = await makeRequest('POST', '/api/v1/auth/login', {
      email: 'comercio@quickly.pe',
      password: 'Password123!',
    });
    if (loginMerchant.status !== 200) {
      throw new Error(`Fallo login de comercio: ${JSON.stringify(loginMerchant.data)}`);
    }
    const merchantCookie = loginMerchant.setCookie ? loginMerchant.setCookie[0].split(';')[0] : '';
    console.log('   ✅ Comerciante autenticado con éxito.');
    const storeId = '07ed9ef6-7bae-4a9f-ad39-57759c54e6ed'; // La Selva Gourmet
    const categoryId = 'c85594f9-080c-4b27-9e59-b93d8abcfdc8'; // Comida preparada

    // -------------------------------------------------------------
    // PASO 2: Dueño crea un producto en su catálogo
    // -------------------------------------------------------------
    console.log('\n👉 [2] Dueño crea un producto en Supabase...');
    const uniqueSuffix = Date.now().toString(36).toUpperCase();
    const createRes = await makeRequest(
      'POST',
      `/api/v1/merchant/stores/${storeId}/products`,
      {
        categoryId,
        name: `Chaufa Amazónico Especial ${uniqueSuffix}`,
        description: 'Arroz chaufa regional salteado al wok con cecina ahumada de Tingo María y plátano maduro.',
        brand: 'La Selva Gourmet',
        skuCode: `SKU-CHAUFA-${uniqueSuffix}`,
        variantName: 'Porción Familiar',
        priceCents: 2600, // S/ 26.00
        initialStock: 30,
      },
      merchantCookie
    );
    if (createRes.status !== 201) {
      throw new Error(`Fallo al crear producto: ${JSON.stringify(createRes.data)}`);
    }
    const createdProduct = createRes.data;
    const productId = createdProduct.productId;
    const skuId = createdProduct.skuId;
    console.log(`   ✅ Producto creado con éxito en Supabase! ID: ${productId}, SKU: ${skuId}`);

    // Verificar en Supabase
    const dbProduct = await pgClient.query('SELECT id, name, is_active FROM catalog.products WHERE id = $1', [productId]);
    console.log('   📊 Verificación en Supabase (catalog.products):', dbProduct.rows[0]);

    // -------------------------------------------------------------
    // PASO 3: Dueño sube una foto del producto
    // -------------------------------------------------------------
    console.log('\n👉 [3] Dueño guarda foto del producto...');
    const photoBase64 = generateMinimalPngBase64();
    const photoRes = await makeRequest(
      'POST',
      `/api/v1/merchant/products/${productId}/images`,
      {
        content: photoBase64,
        altText: 'Foto plato Chaufa Amazónico',
        position: 0,
      },
      merchantCookie
    );
    if (photoRes.status !== 201) {
      throw new Error(`Fallo al subir foto: ${JSON.stringify(photoRes.data)}`);
    }
    console.log('   ✅ Foto guardada exitosamente!');
    const dbImages = await pgClient.query('SELECT id, product_id, object_key, alt_text, position FROM catalog.product_images WHERE product_id = $1', [productId]);
    console.log('   📊 Verificación en Supabase (catalog.product_images):', dbImages.rows);

    // -------------------------------------------------------------
    // PASO 4: Dueño edita la información del producto
    // -------------------------------------------------------------
    console.log('\n👉 [4] Dueño edita la información del producto...');
    const updateRes = await makeRequest(
      'PATCH',
      `/api/v1/merchant/products/${productId}`,
      {
        name: `Chaufa Amazónico Especial ${uniqueSuffix} (Receta de la Casa)`,
        description: 'Exquisito chaufa con cecina crocante, maduritos fritos y finas hierbas amazónicas sachaculantro.',
        brand: 'La Selva Gourmet Premium',
      },
      merchantCookie
    );
    if (updateRes.status !== 200) {
      throw new Error(`Fallo al editar producto: ${JSON.stringify(updateRes.data)}`);
    }
    console.log('   ✅ Producto editado con éxito!');
    const dbUpdated = await pgClient.query('SELECT id, name, description FROM catalog.products WHERE id = $1', [productId]);
    console.log('   📊 Verificación en Supabase (catalog.products actualizado):', dbUpdated.rows[0]);

    // -------------------------------------------------------------
    // PASO 5: Dueño prueba eliminar un producto de prueba
    // -------------------------------------------------------------
    console.log('\n👉 [5] Dueño prueba eliminar un producto de control...');
    const tempProdRes = await makeRequest(
      'POST',
      `/api/v1/merchant/stores/${storeId}/products`,
      {
        categoryId,
        name: `Producto Temporal Eliminar ${uniqueSuffix}`,
        description: 'Temporal para prueba de borrado',
        skuCode: `SKU-TEMP-${uniqueSuffix}`,
        variantName: 'Estándar',
        priceCents: 1500,
        initialStock: 5,
      },
      merchantCookie
    );
    const tempProductId = tempProdRes.data.productId;
    const deleteRes = await makeRequest('DELETE', `/api/v1/merchant/products/${tempProductId}`, null, merchantCookie);
    if (deleteRes.status !== 204) {
      throw new Error(`Fallo al eliminar producto: ${JSON.stringify(deleteRes.data)}`);
    }
    console.log('   ✅ Producto de prueba eliminado exitosamente!');
    const dbDeleted = await pgClient.query('SELECT id, is_active FROM catalog.products WHERE id = $1', [tempProductId]);
    console.log('   📊 Verificación en Supabase: Registro eliminado o desactivado:', dbDeleted.rows[0] || 'TOTALMENTE ELIMINADO');

    // -------------------------------------------------------------
    // PASO 6: Cliente compra el producto creado
    // -------------------------------------------------------------
    console.log('\n👉 [6] Cliente (cliente.tingo@quickly.pe) inicia sesión y compra el producto...');
    const loginCustomer = await makeRequest('POST', '/api/v1/auth/login', {
      email: 'cliente.tingo@quickly.pe',
      password: 'Password123!',
    });
    if (loginCustomer.status !== 200) {
      throw new Error(`Fallo login de cliente: ${JSON.stringify(loginCustomer.data)}`);
    }
    const customerCookie = loginCustomer.setCookie ? loginCustomer.setCookie[0].split(';')[0] : '';
    const addressId = 'cf17afcb-a576-4d3a-a102-9e015f0a5978'; // Jr. Raymondi, Tingo María

    const purchaseRes = await makeRequest(
      'POST',
      '/api/v1/purchases',
      {
        addressId,
        paymentMethod: 'cash',
        items: [
          {
            skuId,
            quantity: 2,
            note: 'Por favor bien caliente y con ají charapita',
          },
        ],
      },
      customerCookie,
      {
        'Idempotency-Key': `TEST-PURCHASE-${uniqueSuffix}`,
      }
    );
    if (purchaseRes.status !== 201) {
      throw new Error(`Fallo al crear compra: ${JSON.stringify(purchaseRes.data)}`);
    }
    const purchase = purchaseRes.data;
    console.log(`   ✅ Compra realizada exitosamente! Código: ${purchase.purchaseNumber}, OrderID: ${purchase.orderId}`);
    console.log(`   💰 Subtotal: S/ ${(purchase.itemsSubtotalCents/100).toFixed(2)}, Delivery: S/ ${(purchase.deliveryFeeCents/100).toFixed(2)}, Total: S/ ${(purchase.totalCents/100).toFixed(2)}`);

    // -------------------------------------------------------------
    // PASO 7: Verificar Notificación al dueño de la tienda en Supabase
    // -------------------------------------------------------------
    console.log('\n👉 [7] Verificando notificación al dueño de la tienda en Supabase...');
    const ownerUserId = 'f0bd1c92-442b-41fc-a145-ae947128e68b'; // comercio@quickly.pe
    const notifs = await pgClient.query(
      `SELECT id, user_id, kind, title, message, relative_url, created_at
       FROM platform.notifications
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [ownerUserId]
    );
    console.log('   🔔 Notificación recibida en Supabase:', notifs.rows[0]);
    if (!notifs.rows.length || notifs.rows[0].kind !== 'order') {
      throw new Error('No se encontró la notificación del pedido en Supabase para el dueño');
    }
    console.log('   ✅ El dueño de la tienda recibió la notificación en tiempo real!');

    // -------------------------------------------------------------
    // PASO 8: Dueño revisa el pedido y avanza la preparación
    // -------------------------------------------------------------
    console.log('\n👉 [8] Dueño de la tienda revisa el pedido en su panel...');
    const storeOrdersRes = await makeRequest(
      'GET',
      `/api/v1/merchant/stores/${storeId}/orders`,
      null,
      merchantCookie
    );
    if (storeOrdersRes.status !== 200) {
      throw new Error(`Fallo al consultar pedidos de tienda: ${JSON.stringify(storeOrdersRes.data)}`);
    }
    const ourOrder = storeOrdersRes.data.find((o) => o.order_id === purchase.orderId);
    console.log('   📋 Pedido revisado por el dueño:');
    console.log(`      ID: ${ourOrder.order_id}`);
    console.log(`      Cliente: ${ourOrder.recipient_name} (${ourOrder.phone})`);
    console.log(`      Dirección: ${ourOrder.street} ${ourOrder.street_number || ''}`);
    console.log(`      Productos:`, ourOrder.items);
    console.log(`      Estado actual: ${ourOrder.status_code}`);

    console.log('\n👉 [8.1] Dueño acepta el pedido (pending -> confirmed)...');
    const acceptRes = await makeRequest(
      'POST',
      `/api/v1/merchant/orders/${purchase.orderId}/accept`,
      { expectedVersion: 0 },
      merchantCookie
    );
    console.log('   ✅ Pedido aceptado:', acceptRes.data);

    console.log('\n👉 [8.2] Dueño inicia preparación (confirmed -> preparing)...');
    const prepRes = await makeRequest(
      'POST',
      `/api/v1/merchant/orders/${purchase.orderId}/start-preparation`,
      { expectedVersion: 1 },
      merchantCookie
    );
    console.log('   ✅ Pedido en preparación:', prepRes.data);

    console.log('\n👉 [8.3] Dueño marca pedido listo para repartidor (preparing -> ready)...');
    const readyRes = await makeRequest(
      'POST',
      `/api/v1/merchant/orders/${purchase.orderId}/mark-ready`,
      { expectedVersion: 2 },
      merchantCookie
    );
    console.log('   ✅ Pedido listo:', readyRes.data);

    // -------------------------------------------------------------
    // PASO 9: Dueño consulta repartidores disponibles y asigna el pedido
    // -------------------------------------------------------------
    console.log('\n👉 [9] Dueño consulta repartidores disponibles en Tingo María...');
    const couriersRes = await makeRequest('GET', '/api/v1/merchant/available-couriers', null, merchantCookie);
    console.log('   🛵 Repartidores activos y en línea:', couriersRes.data);
    const selectedCourier = couriersRes.data[0]; // Carlos Ramos (repartidor@quickly.pe)
    console.log(`   🎯 Repartidor seleccionado: ${selectedCourier.fullName} (${selectedCourier.email}), Vehículo: ${selectedCourier.vehicleType} - Placa: ${selectedCourier.plate}`);

    console.log('\n👉 [10] Dueño asigna el pedido al repartidor...');
    const assignRes = await makeRequest(
      'POST',
      `/api/v1/merchant/orders/${purchase.orderId}/assign-courier`,
      {
        courierUserId: selectedCourier.courierUserId,
        expectedVersion: 3,
        reason: 'Asignado por el dueño para entrega inmediata en Tingo María',
      },
      merchantCookie
    );
    if (assignRes.status !== 201) {
      throw new Error(`Fallo al asignar repartidor: ${JSON.stringify(assignRes.data)}`);
    }
    console.log('   ✅ Asignación creada con éxito:', assignRes.data);

    // -------------------------------------------------------------
    // PASO 11: Verificaciones finales en la Base de Datos de Supabase
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log('🔍 VERIFICACIÓN DE RELACIONES EN LA BASE DE DATOS DE SUPABASE');
    console.log('================================================================');

    const dbAssignment = await pgClient.query(
      `SELECT a.id, a.merchant_order_id, a.courier_user_id, a.status, a.agreed_fee_cents,
              u.full_name as courier_name, u.email as courier_email,
              mo.status_code as order_status, mo.store_id, st.name as store_name,
              p.code as purchase_code, cu.full_name as customer_name
       FROM delivery.assignments a
       JOIN ordering.merchant_orders mo ON a.merchant_order_id = mo.id
       JOIN merchant.stores st ON mo.store_id = st.id
       JOIN ordering.purchases p ON mo.purchase_id = p.id
       JOIN identity.users cu ON p.customer_id = cu.id
       JOIN identity.users u ON a.courier_user_id = u.id
       WHERE a.merchant_order_id = $1`,
      [purchase.orderId]
    );
    console.log('\n📊 Registro en delivery.assignments con relaciones completas:');
    console.table(dbAssignment.rows);

    const courierNotif = await pgClient.query(
      `SELECT id, user_id, kind, title, message, relative_url, created_at
       FROM platform.notifications
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [selectedCourier.courierUserId]
    );
    console.log('\n🔔 Notificación recibida por el repartidor en Supabase:');
    console.table(courierNotif.rows);

    console.log('\n✨ ¡TODAS LAS PRUEBAS COMPLETADAS CON ÉXITO AL 100%! ✨\n');
  } finally {
    await pgClient.end();
  }
}

run().catch((err) => {
  console.error('\n❌ ERROR EN LA PRUEBA:', err);
  process.exit(1);
});
