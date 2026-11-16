# Harness de backend


## Estado vigente del bloque 8 (2026-10-29)

El recorrido SQL/HTTP y de navegador vigente está documentado en ../../Frontend-Quickly/docs/integracion-api/BLOQUE_8_RETIRADA_MOCKS_VALIDACION_INTEGRAL.md. Con TEST_DATABASE_URL apuntando a un servidor de pruebas loopback, npm run test:integration:local ejecuta f0/f2–f7 y npm run test:original:local ejecuta las vistas originales contra una DB aleatoria. El runner rechaza los nombres de specs antiguos porque sus selectores corresponden a interfaces retiradas; las instrucciones de esos specs que siguen abajo son históricas. La configuración principal Playwright solo selecciona original-integral.spec.ts.

Las pruebas con API interceptada usan otras configuraciones y no acreditan persistencia. F8 de respaldo/restauración y staging necesitan Docker y no forman parte del runner local. Detener exclusivamente el cluster iniciado por scripts/test-postgres.ps1 con -Stop al terminar.

## Portada conectada al catálogo

`node scripts/harness-docker.cjs --browser --spec=home.spec.ts` comprueba la portada adaptada del prototipo: búsqueda, categorías, precios, paginación de 24 productos, selección SKU/cantidad, favoritos persistidos, carrito real y comercios. Verifica carga/vacío/error/reintento independientes y ausencia de desbordamiento a 390, 768 y 1440 px. Las capturas se guardan en `../../.tmp/portada-*.png`. El fixture vive exclusivamente en la DB aleatoria del harness; no es una carga de catálogo en desarrollo. La suite también forma parte del cierre integral. Mapa: `../../docs/harness/MAPEO_PORTADA.md`.

## F5 y verificación por bloques

`npm run test:f5` compila y ejecuta solo F5 con PostgreSQL Docker, conservando el contenedor mediante `--keep-db`. Cada DB de suite sigue siendo aleatoria y se elimina incluso al fallar. Después de compilar, `node test/run-e2e.cjs --suite=f5` permite repetir directamente sobre el servidor de pruebas ya iniciado. El worker automático está deshabilitado en test; la suite invoca lotes para verificar concurrencia, deduplicación, rollback y backoff.

El cierre raíz `node scripts/check-workspace.cjs` guarda salida completa, código y duración en `.tmp/workspace-check.log`; admite `--keep-db`. Repetir bloques afectados tras una corrección, conservando evidencia vigente de los demás. Al terminar, detener solo `postgres-test` con `docker compose --profile test stop postgres-test`. Nunca usar `down -v` ni una base operativa para estas pruebas.

Desde `backend/`: `npm ci`, configurar `TEST_DATABASE_URL` y ejecutar `npm run harness:check`.

## Opción principal: Docker

Con Docker Desktop iniciado, desde `backend/`:

```powershell
npm run dev:setup
npm run dev:db
npm run harness:docker
```

`dev:setup` genera contraseñas independientes para desarrollo y pruebas en `.env` ignorado por Git. `dev:db` deja la DB de desarrollo en `127.0.0.1:5433` con volumen persistente. `harness:docker` inicia el servicio `postgres-test` en `127.0.0.1:15432`, ejecuta compilación/unitarias/SQL/HTTP y lo detiene en un bloque de limpieza. El servicio de pruebas usa `tmpfs`, sin montar el volumen de desarrollo.

El runner carga `TEST_DATABASE_URL` desde `.env` si no fue proporcionada por el ambiente. Variables exportadas en la terminal tienen precedencia: retirar valores antiguos si se cambia de servidor. El script Windows con PostgreSQL instalado queda como alternativa; no iniciarlo en 15432 mientras el servicio Docker de pruebas use ese puerto.

## Harness integral de F1

Desde backend, `npm run harness:full`, o desde la raíz del workspace, `node scripts/check-workspace.cjs`. Ejecuta:

1. Compilación y comprobación de OpenAPI backend.
2. Unitarias y SQL/HTTP de F0/F1 con una DB aleatoria.
3. Contratos, TypeScript/Vite y Vitest frontend.
4. Playwright en navegador real, contra otra DB aleatoria, API en 3001 y Vite en 5174.
5. Limpieza de DB de pruebas y detención exclusiva de `postgres-test`.

Para ejecutar solo el recorrido web: `npm run harness:browser`. El frontend requiere `npm ci`; Windows aprovecha Edge instalado. En Linux sin navegador, ejecutar desde frontend `npx playwright install --with-deps chromium`. Playwright no reutiliza servidores que ya estén en esos puertos y rechaza DATABASE_URL cuyo nombre no sea una base temporal generada por el runner. La DB de desarrollo permanece separada.

Las pruebas API usan Origin, cookie y CSRF; ya no devuelven tokens Bearer. Nuevos casos deben conservar ese contrato y evitar imprimir cookies/credenciales en los mensajes de error.

El harness compila, ejecuta Jest y luego crea una base con nombre aleatorio `quickly_test_<hex>` en PostgreSQL 17. Instala `001_schema.sql`, ejecuta `002_verificar.sql`, levanta la aplicación Nest mediante Supertest y prueba las rutas reales. Al terminar elimina únicamente la base que creó. No lee DATABASE_URL como destino de pruebas ni modifica una base de aplicación.

## Servidor aislado

Usar una instancia local de pruebas (puerto recomendado 15432). `TEST_DATABASE_URL` debe usar host loopback y base administrativa `/postgres`. El usuario necesita CREATEDB y ser propietario de las bases que crea. No usar credenciales/servidor de producción.

Ejemplo de variables para una instancia local de pruebas configurada sin contraseña y restringida al loopback:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://quickly_test@127.0.0.1:15432/postgres'
npm run harness:check
```

Si se configura contraseña, proporcionar la URL como variable local/secret de CI, nunca guardarla en Git. El runner rechaza una URL que apunte a una base de negocio. `npm run test:e2e` requiere compilar antes (`npm run build`).

## Instancia temporal en Windows

`scripts/test-postgres.ps1` crea o arranca un cluster propio en `../.tmp/pg-f0` usando PostgreSQL 17 instalado. No usa el servicio instalado ni su directorio de datos. Escucha solo `127.0.0.1:15432` con usuario `quickly_test` y autenticación local trust exclusivamente para desarrollo. Detener con `-Stop` al terminar. No usar esta configuración en ambientes compartidos/producción. Si Windows reserva el puerto, elegir otro con `-Port` y ajustar la URL; no modificar las exclusiones del sistema.

```powershell
./scripts/test-postgres.ps1
$env:TEST_DATABASE_URL = 'postgresql://quickly_test@127.0.0.1:15432/postgres'
npm run harness:check
./scripts/test-postgres.ps1 -Stop
```

## Cobertura F2

Cada archivo HTTP se ejecuta en su propia DB aleatoria: `f0.e2e.cjs` conserva regresiones y `f2.e2e.cjs` comprueba solicitudes, decisiones, roles/membresías, horarios, cobertura, direcciones concurrentes, suspensiones, bootstrap y atomicidad de auditoría/outbox. El runner instala el baseline y aplica dos veces las migraciones; con F3 el inventario resultante incluye 43 tablas (41 baseline + historial de migraciones + movimientos de stock) y 5 vistas.

El navegador usa otra DB aislada. Su administrador sintético se crea únicamente allí mediante bootstrap y credenciales aleatorias en memoria. `operations.spec.ts` verifica comercio/equipo, reparto/rechazo/corrección/suspensión, direcciones/cobertura móvil y revocación de sesiones; se mantienen los cuatro recorridos de identidad de F1. No ejecutar estos fixtures sobre desarrollo.

## Evidencia y mantenimiento

F8: `npm run test:f8` ejecuta salud separada, monitoreo/permisos, logs sin datos privados, 60 lecturas con concurrencia 10, ráfaga idempotente y respaldo/restauración DB+imágenes con nueva compra sobre la DB restaurada. Todo ocurre en DB aleatorias y directorios temporales, sin modificar desarrollo. Usa herramientas pg_dump/pg_restore del contenedor `TEST_POSTGRES_CONTAINER` (local `quickly-postgres-test`; CI pasa el ID del servicio).

`npm run test:staging` es un bloque independiente con build Docker y navegador HTTPS de localhost; crea/elimina exclusivamente su proyecto `quickly-f8-<aleatorio>` y sus volúmenes. No requiere dominio público ni reutiliza el volumen de desarrollo. No ejecutar contra usuarios reales; cierre funcional no sustituye audit de dependencias ni certificado/piloto públicos.

F7 multitienda: `node scripts/harness-docker.cjs --suite=f7` comprueba agrupación atómica, desglose de envío, idempotencia/concurrencia, permisos, rollback completo, stock/mínimos/precios y cancelación/entrega/vencimiento independientes. `node scripts/harness-docker.cjs --browser --spec=multistore.spec.ts` verifica selección persistida, recuperación de respuesta perdida y resumen móvil. Con migración 006 el inventario esperado es 45 tablas/5 vistas. Las demás ampliaciones F7 y la pasarela F6 quedan pendientes; reglas en `../../docs/harness/OPERACION_F7.md`.

F6 iniciada: `node scripts/harness-docker.cjs --suite=f6` compila y ejecuta consultas de métodos/historial propio en una DB aislada. Comprueba disponibilidad explícita, sesión/propiedad, paginación, validación, privacidad y ausencia de efectos de escritura. No acredita cobros ni devoluciones sandbox externos: proveedor y métodos digitales pendientes. Se incluye en el harness general; alcance en `../../docs/harness/OPERACION_F6.md`.

F4 incorpora `f4.e2e.cjs` y `purchase.spec.ts` (cotización, recuperación, cuatro roles, versiones y efectivo). Durante desarrollo usar `npm run test:f4` para solo API/PostgreSQL de F4 y `npm run test:f4:browser` para solo su recorrido web. Ambos crean DB/objetos propios y detienen únicamente `postgres-test`. Frontend dirigido: `npm test -- src/test/realShopping.test.ts`. El cierre conserva `node scripts/check-workspace.cjs` desde la raíz. Contratos de acción ahora exigen `expectedVersion`; entrega exige además `cashReceivedCents`.

F3 agrega `f3.e2e.cjs` para catálogo/SKU, archivos de producto, permisos, ajustes, historial y compras/ajustes concurrentes. Las imágenes de cada suite se guardan en un directorio temporal generado por el runner (`MEDIA_ROOT`), se valida su ubicación antes de limpieza y nunca se usa `.media` de desarrollo. `catalog.spec.ts` publica productos/variantes/imagen y consulta desde otra sesión en móvil, comprueba archivo y fallo de red sin fallback demo. El adaptador de imágenes y sus límites se documentan en `../../docs/harness/EVIDENCIA_F3.md`.

El cierre F3 amplía esta suite con avatar privado, logo/banner, permisos de miembros/solicitudes, cargas superiores a 100 KB, límite HTTP, rollback de outbox, referencias compartidas y persistencia al reiniciar API. Vencimientos se comprueban contra PostgreSQL con carreras entre workers/aceptación, conservación de pedidos aceptados y pagos en proceso, rollback, comando de lote y worker periódico. El intervalo principal se desactiva con `NODE_ENV=test`; el caso de intervalo crea un proceso de aplicación con su propio entorno y lo cierra al terminar. Las fechas antiguas solo se preparan en la DB aleatoria. Política y comandos en `../../docs/harness/OPERACION_F3.md`.

- Estado por fases: `../../docs/harness/ESTADO.md`.
- Decisiones y límites: `../../docs/harness/DECISIONES.md`.
- Agregar escenarios por regla/caso de uso, no pruebas que únicamente repiten strings del código.
- El inventario impreso es de la DB temporal; no acredita el estado de una instancia operativa.
