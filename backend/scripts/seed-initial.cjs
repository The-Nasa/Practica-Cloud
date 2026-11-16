/**
 * Quickly Delivery - Script de Siembra Inicial para Desarrollo (Tingo María)
 *
 * Pobla la base de datos PostgreSQL de desarrollo en Docker con:
 * 1. Zonas de cobertura de Tingo María con sus tarifas en céntimos (PEN).
 * 2. Cuentas de usuario base (Cliente, Comercio, Repartidor, Administrador) y dueños de tiendas.
 * 3. Perfiles de repartidores y direcciones de entrega del cliente.
 * 4. Comercios y tiendas de Tingo María con horarios de atención (L-D 08:00 - 23:00) y membresías.
 * 5. Catálogo completo de platos y productos (108 productos, 127 SKUs) con stock físico inicial en el libro mayor.
 *
 * 100% Idempotente y determinista.
 */

const { Client } = require('pg');
const { createHash, randomBytes, randomUUID, scrypt } = require('node:crypto');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const scryptAsync = promisify(scrypt);

/** Genera un hash seguro con scrypt idéntico al PasswordHasher de NestJS */
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/** Genera un UUID v4 determinista a partir de una clave string */
function toUuid(key) {
  const hash = createHash('sha256').update(key).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Normaliza números de teléfono al formato internacional E.164 (+51...) */
function normalizePhone(rawPhone) {
  if (!rawPhone) return '+51999999999';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('51') && digits.length === 11) return `+${digits}`;
  if (digits.length === 9) return `+51${digits}`;
  return `+51${digits.slice(-9)}`;
}

async function seed(client) {
  console.log('--- Iniciando siembra de datos Quickly Delivery (Tingo María) ---');
  await client.query('BEGIN');

  try {
    // Bloqueo consultivo para evitar ejecuciones concurrentes
    await client.query("SELECT pg_advisory_xact_lock(hashtext('quickly.database.seed_initial'))");

    // Cargar dataset inicial (desde seed-data.json si existe, o extraerlo dinámicamente)
    const seedDataFile = path.join(__dirname, 'seed-data.json');
    if (!fs.existsSync(seedDataFile)) {
      throw new Error('Archivo seed-data.json no encontrado. Ejecute extract-initial-data.cjs primero.');
    }
    const seedData = JSON.parse(fs.readFileSync(seedDataFile, 'utf8'));

    // 1. ZONAS DE COBERTURA
    console.log('1. Sembrando zonas de cobertura de Tingo María...');
    const zoneMap = new Map();
    for (const z of seedData.zones) {
      const zoneId = toUuid(`zone:${z.id}`);
      const res = await client.query(
        `INSERT INTO geography.coverage_zones(id, code, name, description, base_fee_cents, estimated_minutes, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           base_fee_cents = EXCLUDED.base_fee_cents,
           estimated_minutes = EXCLUDED.estimated_minutes,
           is_active = EXCLUDED.is_active
         RETURNING id`,
        [zoneId, z.id, z.name, z.description || '', z.baseFeeCents, z.estimatedMinutes, z.isAvailable ?? true]
      );
      zoneMap.set(z.id, res.rows[0].id);
    }
    console.log(`   ✓ ${zoneMap.size} zonas configuradas.`);

    // 2. CATEGORÍAS DEL CATÁLOGO
    console.log('2. Obteniendo categorías del catálogo...');
    const catRows = (await client.query('SELECT id, code FROM catalog.categories')).rows;
    const catMap = new Map();
    catRows.forEach(r => catMap.set(r.code, r.id));

    // 3. CUENTAS DE USUARIO
    console.log('3. Sembrando cuentas de usuario base...');
    const defaultPasswordHash = await hashPassword('Password123!');

    // Lista consolidada de usuarios requeridos
    const allUsers = [
      ...seedData.users,
      // Propietarios de comercios y repartidores de initialData
      { id: 'u_ruben', name: 'Rubén - Restaurante Rubén', email: 'ruben@quickly.pe', phone: '962 777 999', role: 'comercio', status: 'activo' },
      { id: 'u_encanto', name: 'El Encanto Amazónico', email: 'encanto@quickly.pe', phone: '962 888 123', role: 'comercio', status: 'activo' },
      { id: 'u_mirador', name: 'Recreo Campestre El Mirador', email: 'mirador@quickly.pe', phone: '962 999 444', role: 'comercio', status: 'activo' },
      { id: 'u_vida', name: 'Farmacia Vida', email: 'vida@quickly.pe', phone: '962 555 777', role: 'comercio', status: 'activo' },
      { id: 'u_sanmartin', name: 'Botica San Martín', email: 'sanmartin@quickly.pe', phone: '962 666 888', role: 'comercio', status: 'activo' },
      { id: 'u_bodega_tingo', name: 'Mi Bodega Tingo', email: 'bodegatingo@quickly.pe', phone: '962 111 222', role: 'comercio', status: 'activo' },
      { id: 'u_rupa_mini', name: 'Minimarket Rupa Rupa', email: 'rupamini@quickly.pe', phone: '962 333 444', role: 'comercio', status: 'activo' },
      { id: 'u_modaselva', name: 'Moda Selva Tingo', email: 'modaselva@quickly.pe', phone: '962 444 888', role: 'comercio', status: 'activo' },
      { id: 'u_cacao_cafe', name: 'Cacao & Café Tingo', email: 'cacaocafe@quickly.pe', phone: '962 999 111', role: 'comercio', status: 'activo' },
      { id: 'u_super_lukita', name: 'Supermercado Lukita', email: 'superlukita@quickly.pe', phone: '+51 962 458 900', role: 'comercio', status: 'activo' },
      { id: 'u_tiendas_efe', name: 'Tiendas EFE Tingo María', email: 'tiendasefe@quickly.pe', phone: '+51 962 555 100', role: 'comercio', status: 'activo' },
      { id: 'u_la_curacao', name: 'La Curacao Tingo María', email: 'lacuracao@quickly.pe', phone: '+51 962 777 222', role: 'comercio', status: 'activo' },
      { id: 'u_super_baraton', name: 'Supermercado Baratón', email: 'superbaraton@quickly.pe', phone: '+51 962 123 789', role: 'comercio', status: 'activo' },
      { id: 'u_carsa', name: 'Carsa Tingo María', email: 'carsa@quickly.pe', phone: '+51 962 890 333', role: 'comercio', status: 'activo' },
      { id: 'u_minisol', name: 'Minisol Tingo María', email: 'minisol@quickly.pe', phone: '+51 962 654 321', role: 'comercio', status: 'activo' },
      { id: 'u_galeria_san_benito', name: 'Galería San Benito', email: 'galeriasanbenito@quickly.pe', phone: '+51 962 443 221', role: 'comercio', status: 'activo' },
      { id: 'u_miguel', name: 'Miguel Benites', email: 'miguel@quickly.pe', phone: '962 111 999', role: 'repartidor', status: 'activo' },
      { id: 'u_juan', name: 'Juan Paredes', email: 'juan@quickly.pe', phone: '962 222 777', role: 'repartidor', status: 'activo' },
    ];

    const roleMapping = {
      cliente: 'customer',
      comercio: 'merchant',
      repartidor: 'courier',
      admin: 'admin',
    };

    const statusMapping = {
      activo: 'active',
      pendiente: 'pending',
      pendiente_aprobacion: 'pending',
      suspendido: 'suspended',
    };

    const userMap = new Map();

    for (const u of allUsers) {
      const email = u.email.trim().toLowerCase();
      const phone = normalizePhone(u.phone);
      const status = statusMapping[u.status] || 'active';
      const userId = toUuid(`user:${email}`);

      const userRes = await client.query(
        `INSERT INTO identity.users(id, full_name, email, phone, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           phone = EXCLUDED.phone,
           status = EXCLUDED.status
         RETURNING id`,
        [userId, u.name.trim(), email, phone, status]
      );
      const realUserId = userRes.rows[0].id;
      userMap.set(u.id, realUserId);
      userMap.set(email, realUserId);

      // Credenciales de contraseña
      await client.query(
        `INSERT INTO identity.password_credentials(user_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [realUserId, defaultPasswordHash]
      );

      // Asignar rol principal
      const mainRole = roleMapping[u.role] || 'customer';
      await client.query(
        `INSERT INTO identity.user_roles(user_id, role_code)
         VALUES ($1, $2)
         ON CONFLICT (user_id, role_code) DO NOTHING`,
        [realUserId, mainRole]
      );

      // Todo usuario activo recibe además rol customer para navegar el marketplace
      if (mainRole !== 'customer' && status === 'active') {
        await client.query(
          `INSERT INTO identity.user_roles(user_id, role_code)
           VALUES ($1, 'customer')
           ON CONFLICT (user_id, role_code) DO NOTHING`,
          [realUserId]
        );
      }

      // Si es administrador, registrar auditoría de bootstrap oficial
      if (mainRole === 'admin') {
        await client.query(
          `INSERT INTO platform.audit_entries(actor_user_id, action, entity_type, entity_id, request_id, details)
           VALUES ($1, 'identity.admin_bootstrapped', 'user', $1, $2, '{}')
           ON CONFLICT DO NOTHING`,
          [realUserId, randomUUID()]
        );
      }
    }
    console.log(`   ✓ ${allUsers.length} usuarios con roles y credenciales seguras (contraseña: Password123!).`);

    // 4. PERFILES DE REPARTIDORES
    console.log('4. Sembrando perfiles de repartidores...');
    const courierProfiles = [
      { id: 'c_carlos', userId: userMap.get('repartidor@quickly.pe'), vehicle: 'motorcycle', plate: '4521-7B', status: 'active', isOnline: true, zone: 'z_centro' },
      { id: 'c_miguel', userId: userMap.get('miguel@quickly.pe'), vehicle: 'mototaxi', plate: '9812-3X', status: 'active', isOnline: true, zone: 'z_rupa_norte' },
      { id: 'c_juan', userId: userMap.get('juan@quickly.pe'), vehicle: 'motorcycle', plate: '1245-8A', status: 'active', isOnline: false, zone: 'z_castillo_grande' },
      { id: 'c_luis', userId: userMap.get('luistorres@gmail.com'), vehicle: 'motorcycle', plate: '7841-2M', status: 'pending', isOnline: false, zone: 'z_rupa_sur' },
    ];

    for (const c of courierProfiles) {
      if (!c.userId) continue;
      const zoneId = zoneMap.get(c.zone) || zoneMap.get('z_centro');
      await client.query(
        `INSERT INTO delivery.courier_profiles(user_id, vehicle_type, plate, status, is_online, current_zone_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           vehicle_type = EXCLUDED.vehicle_type,
           plate = EXCLUDED.plate,
           status = EXCLUDED.status,
           is_online = EXCLUDED.is_online,
           current_zone_id = EXCLUDED.current_zone_id`,
        [c.userId, c.vehicle, c.plate, c.status, c.isOnline, zoneId]
      );
    }
    console.log(`   ✓ ${courierProfiles.length} perfiles de repartidor configurados.`);

    // 5. DIRECCIONES DE ENTREGA PARA EL CLIENTE DEMO
    console.log('5. Sembrando direcciones del cliente de prueba...');
    const clientUserId = userMap.get('cliente@quickly.pe');
    if (clientUserId) {
      for (const a of seedData.addresses) {
        const addrId = toUuid(`address:${a.id}`);
        const zoneId = zoneMap.get(a.zoneId) || zoneMap.get('z_centro');
        await client.query(
          `INSERT INTO geography.addresses(id, user_id, zone_id, label, recipient_name, phone, street, street_number, reference, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             label = EXCLUDED.label,
             recipient_name = EXCLUDED.recipient_name,
             phone = EXCLUDED.phone,
             street = EXCLUDED.street,
             street_number = EXCLUDED.street_number,
             reference = EXCLUDED.reference,
             zone_id = EXCLUDED.zone_id,
             is_default = EXCLUDED.is_default`,
          [
            addrId,
            clientUserId,
            zoneId,
            a.label,
            a.recipientName,
            normalizePhone(a.phone),
            a.street,
            a.number,
            a.reference || '',
            a.isDefault ?? false,
          ]
        );
      }
      console.log(`   ✓ ${seedData.addresses.length} direcciones registradas para cliente@quickly.pe.`);
    }

    // 6. COMERCIOS, MEMBRESÍAS Y HORARIOS DE ATENCIÓN
    console.log('6. Sembrando comercios de Tingo María con membresías y horarios (L-D 08:00 - 23:00)...');
    const storeMap = new Map();

    for (const m of seedData.merchants) {
      const storeId = toUuid(`merchant:${m.id}`);
      const zoneId = zoneMap.get(m.zoneId) || zoneMap.get('z_centro');
      const ownerUserId = userMap.get(m.ownerUserId) || userMap.get('comercio@quickly.pe');

      const isStorePending = m.status === 'pendiente';
      const storeStatus = isStorePending ? 'pending' : 'active';
      // m_recreo_mirador se mantiene cerrado intencionalmente para pruebas de tienda cerrada
      const acceptingOrders = !isStorePending && (m.isOpen !== false);

      await client.query(
        `INSERT INTO merchant.stores(id, category_code, zone_id, name, description, address_text, phone, status, accepting_orders, preparation_minutes, minimum_order_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           category_code = EXCLUDED.category_code,
           zone_id = EXCLUDED.zone_id,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           address_text = EXCLUDED.address_text,
           phone = EXCLUDED.phone,
           status = EXCLUDED.status,
           accepting_orders = EXCLUDED.accepting_orders,
           preparation_minutes = EXCLUDED.preparation_minutes,
           minimum_order_cents = EXCLUDED.minimum_order_cents`,
        [
          storeId,
          m.category,
          zoneId,
          m.name.trim(),
          m.description || '',
          m.address,
          normalizePhone(m.phone),
          storeStatus,
          acceptingOrders,
          m.prepTimeMinutes || 30,
          m.minOrderCents || 0,
        ]
      );
      storeMap.set(m.id, storeId);

      // Membresía de propietario
      if (ownerUserId) {
        await client.query(
          `INSERT INTO merchant.memberships(store_id, user_id, membership_role, is_active)
           VALUES ($1, $2, 'owner', true)
           ON CONFLICT (store_id, user_id) DO NOTHING`,
          [storeId, ownerUserId]
        );
      }

      // Horarios de atención: Lunes a Domingo de 08:00 a 23:00 para comercios activos
      if (storeStatus === 'active') {
        for (let weekday = 1; weekday <= 7; weekday++) {
          await client.query(
            `INSERT INTO merchant.opening_intervals(store_id, weekday, opens_at, closes_at)
             VALUES ($1, $2, '08:00:00', '23:00:00')
             ON CONFLICT (store_id, weekday, opens_at) DO NOTHING`,
            [storeId, weekday]
          );
        }
      }
    }
    console.log(`   ✓ ${seedData.merchants.length} comercios registrados con horarios de atención.`);

    // 7. PLATOS, PRODUCTOS, SKUS E INVENTARIO INICIAL
    console.log('7. Sembrando catálogo completo de platos y productos con SKUs y stock...');

    const categoryTaxonomyMapping = {
      restaurantes: 'prepared_food',
      farmacias: 'health',
      bodegas: 'groceries',
      ropa: 'clothing',
      emprendedores: 'groceries',
      supermercados: 'groceries',
      tecnologia: 'technology',
      electrohogar: 'home',
      hogar: 'home',
    };

    let totalProductsCount = 0;
    let totalSkusCount = 0;
    const adminUserId = userMap.get('admin@quickly.pe');

    for (let i = 0; i < seedData.products.length; i++) {
      const p = seedData.products[i];
      const productId = toUuid(`product:${p.id}`);
      const storeId = storeMap.get(p.merchantId);
      if (!storeId) continue;

      // Determinar categoría taxonómica
      const isBeverage = /jarra|jugo|refresco|gaseosa|cocona|camu|cerveza|vino|cafe|agua/i.test(p.name);
      const catCode = isBeverage ? 'beverages' : (categoryTaxonomyMapping[p.category] || 'other');
      const categoryId = catMap.get(catCode) || catMap.get('other') || catRows[0].id;

      await client.query(
        `INSERT INTO catalog.products(id, store_id, category_id, name, description, brand, is_active, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           store_id = EXCLUDED.store_id,
           category_id = EXCLUDED.category_id,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           brand = EXCLUDED.brand,
           is_active = EXCLUDED.is_active,
           position = EXCLUDED.position`,
        [
          productId,
          storeId,
          categoryId,
          p.name.trim(),
          p.description || '',
          p.brand || null,
          p.isAvailable !== false,
          i,
        ]
      );
      totalProductsCount++;

      // Procesar SKUs (con variantes o estándar)
      const skuList = [];
      if (p.hasVariants && Array.isArray(p.variants) && p.variants.length > 0) {
        for (const v of p.variants) {
          const skuCode = (p.sku ? `${p.sku}-${v.id.replace('v_', '')}` : `SKU-${p.id}-${v.id}`).toUpperCase();
          const priceCents = p.priceCents + (v.priceDifferenceCents || 0);
          const skuId = toUuid(`sku:${p.id}:${v.id}`);
          skuList.push({
            id: skuId,
            skuCode,
            variantName: v.name.trim(),
            priceCents: Math.max(1, priceCents),
            barcode: null,
            isActive: (v.isAvailable !== false) && (p.isAvailable !== false),
            stock: p.stock || 40,
          });
        }
      } else {
        const skuCode = (p.sku || `SKU-${p.id}`).toUpperCase();
        const skuId = toUuid(`sku:${p.id}:std`);
        skuList.push({
          id: skuId,
          skuCode,
          variantName: 'Estandar',
          priceCents: Math.max(1, p.priceCents),
          barcode: p.barcode || null,
          isActive: p.isAvailable !== false,
          stock: p.stock || 50,
        });
      }

      for (const sku of skuList) {
        await client.query(
          `INSERT INTO catalog.skus(id, product_id, sku_code, variant_name, price_cents, barcode, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (product_id, variant_name) DO UPDATE SET
             sku_code = EXCLUDED.sku_code,
             price_cents = EXCLUDED.price_cents,
             barcode = EXCLUDED.barcode,
             is_active = EXCLUDED.is_active`,
          [sku.id, productId, sku.skuCode, sku.variantName, sku.priceCents, sku.barcode, sku.isActive]
        );
        totalSkusCount++;

        // Registrar existencia física de inventario
        await client.query(
          `INSERT INTO inventory.stock(sku_id, on_hand, low_stock_threshold)
           VALUES ($1, $2, 5)
           ON CONFLICT (sku_id) DO UPDATE SET on_hand = EXCLUDED.on_hand`,
          [sku.id, sku.stock]
        );

        // Movimiento inicial de inventario en el libro mayor inmutable
        if (sku.stock > 0 && adminUserId) {
          await client.query(
            `INSERT INTO inventory.movements(sku_id, actor_user_id, kind, quantity, on_hand_after, reason)
             SELECT $1, $2, 'initial', $3, $3, 'Existencia inicial'
             WHERE NOT EXISTS (SELECT 1 FROM inventory.movements WHERE sku_id = $1 AND kind = 'initial')`,
            [sku.id, adminUserId, sku.stock]
          );
        }
      }
    }
    console.log(`   ✓ ${totalProductsCount} productos persistidos con ${totalSkusCount} SKUs y stock asignado.`);

    await client.query('COMMIT');
    console.log('\n======================================================');
    console.log('✅ Siembra de desarrollo completada con éxito.');
    console.log('   - Zonas de Tingo María: 5');
    console.log(`   - Usuarios totales:    ${allUsers.length}`);
    console.log(`   - Comercios reales:    ${seedData.merchants.length}`);
    console.log(`   - Platos/Productos:    ${totalProductsCount}`);
    console.log(`   - SKUs vendibles:      ${totalSkusCount}`);
    console.log('======================================================');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la siembra de base de datos:', error);
    throw error;
  }
}

if (require.main === module) {
  (async () => {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
      throw new Error('DATABASE_URL o DATABASE_HOST no configurados en .env');
    }

    const useSsl = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_URL?.includes('supabase') || process.env.DATABASE_HOST?.includes('supabase');
    const ssl = useSsl ? { rejectUnauthorized: false } : undefined;
    const client = new Client(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ssl }
        : {
            host: process.env.DATABASE_HOST,
            port: Number(process.env.DATABASE_PORT || 5432),
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME,
            ssl,
          }
    );

    try {
      await client.connect();
      await seed(client);
    } finally {
      await client.end();
    }
  })().catch((err) => {
    console.error('Fallo crítico en db:seed:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { seed };
