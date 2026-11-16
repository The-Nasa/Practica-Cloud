const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function getImageUrlForProduct(name, category, store) {
  const n = (name || '').toLowerCase();
  const c = (category || '').toLowerCase();
  const s = (store || '').toLowerCase();

  // 1. Food / Restaurant dishes
  if (n.includes('pollo a la brasa')) {
    return 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('juane')) {
    return 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('chaufa')) {
    return 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('tacacho') || n.includes('cecina')) {
    return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('paiche') || n.includes('chicharrón de paiche')) {
    return 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('costillas')) {
    return 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('chorizo')) {
    return 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&auto=format&fit=crop&q=80';
  }

  // 2. Drinks / Beverages
  if (n.includes('refresco') || n.includes('camu camu') && (n.includes('jarra') || n.includes('refresco') || c.includes('bebida'))) {
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('agua mineral') || n.includes('san mateo')) {
    return 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('whisky') || n.includes('johnnie walker') || n.includes('vino') || n.includes('ron') || n.includes('cerveza')) {
    return 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?w=600&auto=format&fit=crop&q=80';
  }

  // 3. Coffee & Chocolate / Sweets
  if (n.includes('café') || n.includes('cafe')) {
    return 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('chocolate') || n.includes('bombones') || n.includes('cacao') || n.includes('trufas')) {
    return 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('miel') || n.includes('mermelada')) {
    return 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&auto=format&fit=crop&q=80';
  }

  // 4. Groceries / Despensa
  if (n.includes('aceite')) {
    return 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('arroz')) {
    return 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('fideo') || n.includes('tallarin') || n.includes('spaghetti') || n.includes('ramen')) {
    return 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('atún') || n.includes('atun') || n.includes('filete') || n.includes('durazno') || n.includes('conserva')) {
    return 'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('galleta') || n.includes('coronita') || n.includes('field') || n.includes('snack')) {
    return 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('leche') || n.includes('gloria') || n.includes('yogurt')) {
    return 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('detergente') || n.includes('ariel') || n.includes('lavavajilla') || n.includes('limpiador')) {
    return 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop&q=80';
  }

  // 5. Tech / Smartphones / TVs / Watches
  if (n.includes('iphone') || n.includes('xiaomi') || n.includes('samsung galaxy') || n.includes('smartphone') || n.includes('celular') || n.includes('redmi') || n.includes('poco')) {
    return 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('smartwatch') || n.includes('reloj inteligente') || n.includes('band')) {
    return 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('smart tv') || n.includes('tv ') || n.includes('televisor') || n.includes('uhd')) {
    return 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&auto=format&fit=crop&q=80';
  }

  // 6. Home Appliances / Electrodomésticos
  if (n.includes('refrigeradora') || n.includes('refrigerador')) {
    return 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('cocina')) {
    return 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('microondas') || n.includes('horno')) {
    return 'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('freidora') || n.includes('airfryer')) {
    return 'https://images.unsplash.com/photo-1585515320310-259814833e62?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('picatodo') || n.includes('licuadora') || n.includes('batidora')) {
    return 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=600&auto=format&fit=crop&q=80';
  }

  // 7. Pharmacy / Health / Care
  if (n.includes('shampoo') || n.includes('acondicionador') || n.includes('jabon') || n.includes('jabón')) {
    return 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('alcohol') || n.includes('gel')) {
    return 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('termómetro') || n.includes('termometro')) {
    return 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('bloqueador') || n.includes('repelente') || n.includes('solar')) {
    return 'https://images.unsplash.com/photo-1584362917165-526a968579e8?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('curitas') || n.includes('gasa') || n.includes('algodón') || n.includes('algodon')) {
    return 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('ibuprofeno') || n.includes('paracetamol') || n.includes('vitamina') || n.includes('electrolitos') || c.includes('salud')) {
    return 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80';
  }

  // 8. Camping & Travel & Housewares
  if (n.includes('carpa') || n.includes('camping')) {
    return 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('termo') || n.includes('mug') || n.includes('taza')) {
    return 'https://images.unsplash.com/photo-1517646287270-a5a9ca602e5c?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('linterna') || n.includes('foco')) {
    return 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('colchón') || n.includes('colchon') || n.includes('mesa') || n.includes('silla')) {
    return 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('canasta') || n.includes('regalo')) {
    return 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('gas') || n.includes('butano')) {
    return 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600&auto=format&fit=crop&q=80';
  }

  // 9. Apparel / Fashion / Toys
  if (n.includes('pantalón') || n.includes('pantalon') || n.includes('vestido') || n.includes('polo') || n.includes('camisa')) {
    return 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('zapatillas') || n.includes('vans') || n.includes('sandalias')) {
    return 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('sombrero') || n.includes('gorra')) {
    return 'https://images.unsplash.com/photo-1521369909029-2afed882baee?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('cuadernos') || n.includes('escolar') || n.includes('útiles') || n.includes('utiles')) {
    return 'https://images.unsplash.com/photo-1588072432836-e10032774350?w=600&auto=format&fit=crop&q=80';
  }
  if (n.includes('hot wheels') || n.includes('juguete') || n.includes('carritos')) {
    return 'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=600&auto=format&fit=crop&q=80';
  }

  // Default fallback based on category
  if (c.includes('comida') || c.includes('gastronom')) {
    return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80';
  }
  if (c.includes('bebida')) {
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80';
  }
  if (c.includes('salud') || c.includes('farma')) {
    return 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80';
  }
  if (c.includes('tecnolog') || c.includes('electro')) {
    return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
  }

  return 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80';
}

async function main() {
  const client = await pool.connect();
  try {
    // 1. Deactivate test product "dasadas"
    const deactRes = await client.query("UPDATE catalog.products SET is_active = false WHERE name ILIKE '%dasadas%' RETURNING id, name");
    if (deactRes.rowCount > 0) {
      console.log('Deactivated test products:', deactRes.rows);
    }

    // 2. Fetch all active products
    const res = await client.query(`
      SELECT p.id, p.name, c.name as category, s.name as store
      FROM catalog.products p
      LEFT JOIN catalog.categories c ON c.id = p.category_id
      LEFT JOIN merchant.stores s ON s.id = p.store_id
      WHERE p.is_active = true
      ORDER BY p.name
    `);

    console.log(`Processing ${res.rows.length} active products...`);
    let addedCount = 0;
    let updatedCount = 0;

    for (const prod of res.rows) {
      const imgUrl = getImageUrlForProduct(prod.name, prod.category, prod.store);
      const altText = `Foto de ${prod.name}`;

      // Check if product already has an image
      const existing = await client.query(
        'SELECT id, object_key FROM catalog.product_images WHERE product_id = $1 ORDER BY position LIMIT 1',
        [prod.id]
      );

      if (existing.rowCount === 0) {
        // Insert new image
        await client.query(
          `INSERT INTO catalog.product_images (id, product_id, object_key, alt_text, position)
           VALUES (gen_random_uuid(), $1, $2, $3, 0)`,
          [prod.id, imgUrl, altText]
        );
        addedCount++;
      } else {
        // If it was an old broken .png filename, update it to the Unsplash URL
        const oldKey = existing.rows[0].object_key;
        if (!oldKey.startsWith('http://') && !oldKey.startsWith('https://')) {
          await client.query(
            'UPDATE catalog.product_images SET object_key = $1, alt_text = $2 WHERE id = $3',
            [imgUrl, altText, existing.rows[0].id]
          );
          updatedCount++;
        }
      }
    }

    console.log(`Done! Added ${addedCount} images, updated ${updatedCount} images.`);
    
    // Quick verification
    const countCheck = await client.query(`
      SELECT count(*) as total_with_images
      FROM catalog.products p
      JOIN catalog.product_images pi ON pi.product_id = p.id
      WHERE p.is_active = true
    `);
    console.log('Active products with images now:', countCheck.rows[0].total_with_images);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});

