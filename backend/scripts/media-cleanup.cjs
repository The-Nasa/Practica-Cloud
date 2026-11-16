// Offline orphan cleanup: stop API writers before applying; dry-run by default.
const { readdir, stat, unlink } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { Client } = require('pg');
require('dotenv').config();
async function cleanupMedia(db, root, apply = false) {
  const absoluteRoot = resolve(root);
  const referenced = new Set((await db.query(`SELECT object_key FROM catalog.product_images
    UNION SELECT avatar_object_key FROM identity.users WHERE avatar_object_key IS NOT NULL
    UNION SELECT logo_object_key FROM merchant.stores WHERE logo_object_key IS NOT NULL
    UNION SELECT banner_object_key FROM merchant.stores WHERE banner_object_key IS NOT NULL`)).rows.map(row=>row.object_key));
  let scanned=0,orphans=0,removed=0;
  const files = await readdir(absoluteRoot,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  for(const file of files) {
    // Never traverse subdirectories/symlinks or delete arbitrary user-supplied names.
    if(!file.isFile() || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/.test(file.name))continue;
    scanned++;
    const target=join(absoluteRoot,file.name);
    if(referenced.has(file.name) || Date.now()-(await stat(target)).mtimeMs<24*60*60*1000)continue;
    orphans++;
    if(apply){await unlink(target);removed++;}
  }
  return {scanned,orphans,removed};
}
module.exports={cleanupMedia};
if(require.main===module) {
  const db=new Client({connectionString:process.env.DATABASE_URL});
  (async()=>{try{if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_REQUIRED');await db.connect();
    console.log(JSON.stringify(await cleanupMedia(db,process.env.MEDIA_ROOT || '.media',process.argv.includes('--apply'))));
  }finally{await db.end();}})().catch(()=>{console.error('No se pudo verificar/limpiar media. No se imprimen datos de conexión.');process.exitCode=1;});
}
