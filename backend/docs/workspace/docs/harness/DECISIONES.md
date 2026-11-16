# Decisiones técnicas y operativas

## D18. F8: preparación local y criterios del piloto

Se implementa preparación operativa verificable con efectivo: validación de producción HTTPS/cookie Secure, un proxy confiable y logs sin cuerpos/credenciales; liveness/readiness separados, pool/timeouts y panel de avisos del servidor. Staging separado usa migraciones con propietario y API `quickly_app` sin superusuario/DDL, volúmenes propios de DB/media/certificados y mismo origen web/API. No se publica ni se crean cuentas reales desde las pruebas.

Respaldo conjunto exige mantenimiento, locks SHARE y snapshot exportado compartido con pg_dump; conserva únicamente objetos referenciados y hashes. Restauración siempre en DB aleatoria/directorio nuevo, verifica migraciones/referencias, revoca sesiones y registra auditoría antes de habilitar el resultado. Los dumps no restauran ACL; reprovisionar permisos con propietario. Revisar pedidos/cobros ocurridos después del respaldo antes de habilitar tráfico/workers. Cifrado/copia externa, frecuencia/retención, RPO/RTO y responsables requieren definición y prueba en destino.

El ensayo HTTPS usa exclusivamente localhost y certificado interno aceptado solo por su contexto de pruebas; prueba sesión, CSRF, CSP, proxy, permisos, imagen/sesión tras reinicio y logout. No acredita dominio/certificado públicos ni piloto. La carga de fixtures pequeños no constituye un SLA.

La auditoría npm encontró hallazgos altos residuales y correcciones mayores necesarias. Compilar y pasar el harness no se interpreta como seguridad aprobada. No declarar F8 completa hasta resolver dependencias, infraestructura pública, efectivo/conciliación y realizar el piloto. Estado, manual, checklist y seguimiento en `OPERACION_F8.md`, `CHECKLIST_PILOTO_F8.md` y `SEGURIDAD_F8.md`.

## D17. F7: selección de alcance y checkout multitienda con efectivo

El usuario elige compras de varias tiendas y deja las demás ampliaciones de F7 pendientes (Google, GPS, promociones, carrito remoto y liquidaciones). También deja pendiente el proveedor de F6. Esta decisión amplía la restricción de tienda única de D03/D15: una confirmación agrupa compras independientes por tienda, cada una con envío/cobro propios, conservando la integridad financiera existente y los flujos F4/F5.

Una dirección, cobertura válida para todas, hasta 10 tiendas/100 líneas; mínimo y horario por tienda. Tarifa de zona por envío, desglosada antes de confirmar. Efectivo exacto previsto por entrega en multitienda; no repartir un billete global ni prometer recogida/entrega conjunta. Creación atómica de todas las compras con locks globales estables, idempotencia y auditoría/outbox. Operación posterior independiente: cancelación, vencimiento y cobro de una tienda no modifican los otros pedidos. No se inventan reembolsos digitales ni liquidaciones.

Migración 006 aditiva con grupo y referencia opcional en compras; pertenencia asociada al insertar, preservando compras históricas inmutables. Resumen solo del comprador; la tienda accede exclusivamente a sus pedidos. Recuperación persistida distingue checkout único/multitienda. Reglas y rutas en [OPERACION_F7.md](OPERACION_F7.md). No declarar todas las ampliaciones F7 completas por implementar esta iniciativa.

## D16. F5: operación, canal interno y cierre por bloques

Favoritos propios por producto/tienda mediante estado deseado idempotente; reseña única por comprador con entrega completada. No se importan hechos del prototipo. Soporte conversacional conserva mensajes; decisiones administrativas requieren versión, respuesta, estado y prioridad. Nueva incidencia crea ticket y mensaje en su misma transacción; mismo reportante/asignación/descripción es reintento. Resolver soporte nunca implica entrega, devolución de stock ni resolución financiera.

Canal interno de notificaciones consume outbox durable con locks `SKIP LOCKED`, savepoint por evento, backoff y unicidad evento/usuario. Aviso/publicación comparten transacción; una caída revierte el reclamo. No hay servicios externos bajo locks ni preferencias para canales aún inexistentes. Proveedores correo/push quedan fuera del canal interno, conforme al plan M10; F6 deberá coordinar consumidores adicionales antes de compartir publicación de eventos con proveedores.

Reportes definen cohorte por creación del pedido, intervalo ISO con zona [inicio, fin), estado vigente y máximo 366 días. Ventas entregadas, importe debido efectivamente cobrado y tarifas pactadas son indicadores separados; exportación conserva filtros/permisos. No se presenta una tarifa como dinero liquidado. D06 y custodia/conciliación conservan definición antes del piloto. Auditoría consulta metadatos por administrador, con filtro exacto de acción y sin exponer JSON sensible indiscriminadamente.

Se mantiene PostgreSQL de pruebas encendido durante bloques (`--keep-db`), conservando DB aleatorias aisladas que siempre se eliminan. El cierre raíz guarda automáticamente log, código y duración; correcciones repiten el bloque afectado y preservan evidencia vigente. Contratos y límites: [OPERACION_F5.md](OPERACION_F5.md).

Fecha: 26 de octubre de 2026.

## D15. F4: compra en efectivo y operación entre cuatro roles

Carrito real versionado separado del prototipo, solo intención SKU/cantidad/notas; nombres/precios/stock proceden de HTTP. Cotización informativa sin reserva; compra recalcula todo y compara el total revisado. Una tienda y una zona por compra/entrega. Dirección propia activa; comercio aprobado, recibiendo según horario; repartidor aprobado/disponible en la misma zona. Identidad e importes nunca se toman del objeto de compra del navegador.

Clave idempotente y payload de intención se guardan por cuenta en sessionStorage para recuperar tras timeout/recarga. Consulta de intento devuelve estado actual del recurso autorizado; reenvío conserva misma clave/cuerpo. No se crea otra intención mientras el resultado sea incierto. El carrito conserva lo no comprado y lo editado después de confirmar; datos mock anteriores se reconstruyen desde catálogo. Una confirmación guardada inválida se distingue de ausencia de intención y exige revisar pedidos antes de descartarla.

Las acciones públicas exigen versión esperada de pedido/asignación; una pantalla obsoleta recibe 409. Cancelar/rechazar respeta matriz baseline y libera/cancela efectivo pendiente sin variar stock físico. Liberar asignación solo antes de retiro, para reasignar; después se registra incidencia y se conserva stock consumido/entrega activa para coordinación, sin inventar devolución ni resolución de soporte.

Efectivo previsto se persiste al comprar; efectivo recibido real se exige al entregar y puede diferir del billete previsto, siempre cubriendo total. Cambio se deriva en servidor/detalle de importes persistidos. Entrega/cobro/cobrador/fecha/evento/auditoría/outbox son atómicos. Tarifa acordada sigue configuración provisional D06; cobro y tarifa no declaran una liquidación financiera. Custodia/traspasos/liquidaciones requieren definición antes del piloto. No se habilitan métodos digitales ni pagos ficticios.

Administración consulta y coordina asignación/liberación/cancelación permitida con motivo; no salta retiro ni efectivo por cambio genérico. Destino personal no se expone en disponibles; repartidor asignado lo consulta durante entrega y se oculta en su historial entregado. Catálogo/pedidos/compras se consultan por recurso; API de recuperación solo pertenece a la cuenta de la clave.

Se adopta el flujo de verificación acordado por el usuario: pruebas específicas durante desarrollo, integración del recorrido y harness integral al cierre. No ejecutar todo el harness por cada ajuste. Contratos/reglas y comandos en [OPERACION_F4.md](OPERACION_F4.md); evidencia en [EVIDENCIA_F4.md](EVIDENCIA_F4.md). F5/F6/F8 conservan sus pendientes.

Fecha: 26 de octubre de 2026.

## D14. Cierre funcional F3: archivos de perfil/comercio y aceptación con plazo

Se amplía D13 con un módulo de objetos compartido para producto, avatar, logo y banner, conservando las columnas de clave del baseline. Avatar privado de su cuenta; branding público únicamente con comercio y zona habilitados, y acceso privado de miembros para preparación/revisión. Propietario/encargado administran imágenes conforme a F2; operador consulta. La confirmación ocurre en la misma petición después de validar y comprobar permisos nuevamente. Reemplazo no elimina objetos todavía referenciados. El almacenamiento local se persiste también en Compose; respaldo de DB y objetos es conjunto. Contratos y operación en [OPERACION_F3.md](OPERACION_F3.md).

Se adopta un plazo de aceptación de 15 minutos para desarrollo, configurable mediante `PENDING_ORDER_TTL_MINUTES` (0: manual para nuevos pedidos), y un ciclo de 30 segundos mediante `ORDER_EXPIRATION_INTERVAL_SECONDS` (0: sin intervalo). Se expuso esta elección como preferencia y se continuó con el valor propuesto; se puede ajustar sin migrar ni ampliar plazos existentes. La ratificación de duración para piloto sigue siendo operativa. Migración 003 agrega plazo explícito al pedido; no modifica baselines ni migraciones aplicadas, ni asigna vencimientos retroactivos.

El vencimiento cancela únicamente `pending` con efectivo pendiente, una tienda y sin asignación; pedido/reservas/pago/evento/auditoría/outbox cambian atómicamente, sin variar stock físico. Aceptación tardía devuelve 409 después de confirmar la cancelación. Aceptación y worker serializan sobre el pedido y se comprueba el reloj PostgreSQL en la actualización. No se liberan reservas por fecha aislada ni se vencen pedidos aceptados/preparados/en reparto. Pagos en proceso/digitales, compras multitienda y asignaciones requieren resolución del dominio correspondiente; no se infiere cancelación financiera.

El worker vive en la API, sin dependencias ni infraestructura nueva; `SKIP LOCKED` evita que dos instancias procesen el mismo pedido. También existe ejecución por lote con cierre de contexto. Actor de sistema nulo, request ID y origen explícito en auditoría. Reintentar la clave idempotente de una compra vencida conserva el recibo original, sin crear otra compra ni otra reserva; F4 deberá consultar su estado vigente.

Esto sustituye el aplazamiento de avatar/logo/banner y aceptación con plazo anotado en el primer bloque D13. Preparación/incidencias posteriores, checkout web y pago digital conservan su fase F4/F6; HTTPS, operación multiinstancia y restauración completa conservan su validación F8.

Fecha: 26 de octubre de 2026.

## D13. F3: catálogo real, stock e imágenes de producto

Catálogo público agregado por producto, variantes vendibles con importes absolutos por SKU y respuestas camelCase paginadas. Producto y SKU se archivan/desactivan; no se borran líneas ni snapshots de venta. Categorías de producto independientes del giro comercial: comida preparada, bebidas, despensa, salud, cuidado personal, hogar, tecnología, ropa/accesorios y otros. No se deduce una categoría de producto desde el comercio ni se otorgan sellos oficiales.

La fachada de inventario recibe el cliente transaccional del caso de uso. Ajustar exige delta distinto de cero y motivo, bloquea existencia física y conserva reservas. La nueva bitácora comienza con las operaciones posteriores a su migración, sin reconstruir movimientos ficticios. Reservar/liberar no cambia existencia física; retirar consume reserva y existencia una sola vez y registra el movimiento con referencia a la línea vendida.

Primer adaptador de imágenes: objetos locales en `MEDIA_ROOT`, claves UUID generadas por servidor y referencias en DB. Se valida y confirma/publica en la misma petición; errores revierten DB y eliminan el archivo recién creado. Caídas entre archivo/commit pueden dejar huérfanos; limpieza offline, por defecto en simulación, únicamente objetos no referenciados de más de 24 h. No ejecutar aplicación multiinstancia sin definir almacenamiento compartido y respaldo. PNG validado/saneado con límites; no SVG ni metadatos. Lectura pública comprueba estado de producto/comercio/zona; lectura comercial de archivados exige permisos por recurso.

En el primer bloque F3 quedó abierta para avatar/logo/banner y política explícita de vencimientos; D14 resuelve esos pendientes con su evidencia de cierre. El reloj de una reserva no libera inventario ni modifica pedidos aceptados por sí solo. El checkout web sigue pendiente en F4; el catálogo no confirma compras locales ni cae a mocks cuando falla HTTP.

Fecha: 26 de octubre de 2026.

## D12. F2: habilitación operativa y migraciones

F2 complementa D03/D04/D07 mediante migración aditiva: razón social/RUC opcionales, membresías revocables, motivos y fechas de revisión. El baseline aplicado permanece intacto. `platform.schema_migrations` registra versiones/checksums normalizando CRLF y un lock serializa aplicaciones; no editar SQL aplicado. `dev:db` aplica pendientes después de iniciar Docker.

La cuenta personal no concede operación comercial/reparto. Solicitudes pendientes son accesibles con sesión; aprobación administrativa concede roles y revocación/suspensión los recalcula según otros recursos activos. Identidad comercial y vehículo/placa aprobados vuelven a revisión al cambiar. Rechazo permite corregir; suspensión exige reactivación administrativa. Cada decisión requiere motivo.

El primer administrador se habilita exclusivamente mediante `admin:bootstrap` sobre una cuenta activa ya registrada, con lock/auditoría; no existe autoasignación pública ni contraseña predeterminada. Si ya existe administrador solo se permite repetición idempotente para esa misma cuenta. La administración crea cobertura explícita: no sembrar zonas ficticias en desarrollo.

Propietario administra identidad/equipo; encargado administra perfil operativo/horarios; operador consulta. Permisos por recurso se verifican dentro de transacciones de mutación. Horarios por día en `America/Lima`, sin solapamientos; intervalos nocturnos se dividen, con cierre `24:00`. Recibir pedidos exige comercio/zona activos, recepción habilitada y horario vigente.

Direcciones se archivan y conservan historial; hay una predeterminada entre las activas, serializada por cuenta. Desactivar zona conserva direcciones y pedidos; frena nuevas altas/compras y desconecta repartidores, sin abandonar entregas. Suspender comercio/repartidor/cuenta se rechaza si abandonaría pedidos/asignaciones activos. Suspender cuenta revoca sesiones; reactivación no restaura sesiones ni recepción/disponibilidad automáticamente.

Las mutaciones nuevas registran auditoría y outbox atómicamente con request ID; no incluyen contenido de direcciones ni credenciales. F2 no implementa procesamiento externo del outbox, mapas, validación tributaria ni el catálogo/checkout web de fases posteriores.

Fecha: 26 de octubre de 2026. Estas decisiones pueden evolucionar mediante una entrada con motivo, impacto y prueba.

## D01. Persistencia

Continuar con `pg` y SQL existente. Prisma es una propuesta previa, no una dependencia instalada. Extraer adaptadores/puertos progresivamente por caso de uso; no introducir un ORM durante la reparación de F0.

## D02. Sesión y topología web

F0 conservó temporalmente Bearer opaco. F1 lo reemplaza por cookie HttpOnly y cliente HTTP integrado, con CSRF por sesión y validación exacta de Origin. La topología se verifica localmente con proxy del mismo origen en navegador real. La comprobación de HTTPS/CORS/cookies en un staging público se conserva como requisito de despliegue antes del piloto; no existe un backend público configurado en este workspace. No persistir credenciales o perfil real en localStorage.

## D03. Primer flujo operativo

Una tienda por compra, una entrega activa por repartidor y efectivo como único método habilitado hasta F6. La tarifa de envío procede de la zona del destino. Horarios y cobertura geográfica detallada se completan en F2/F4; F0 solo acredita la API ya existente, no habilita un lanzamiento.

## D04. Aprobación y permisos

Alta de comercio pendiente y recepción deshabilitada. Solo aprobación administrativa habilita tienda y rol comercial. Una membresía pertenece a una tienda; en el baseline no existe `memberships.is_active`. No inventar ese campo: la membresía existente autoriza dentro de su tienda; gestión/revocación se completa en F2. Admin puede consultar tiendas y ejecutar las transiciones existentes permitidas, sin saltar las reglas SQL.

## D05. Inventario e idempotencia

Checkout exige Idempotency-Key, compara hash canónico, reserva la clave en la misma transacción y devuelve una respuesta serializada estable. Claves vencidas se rechazan para evitar duplicados silenciosos tras expiración; su limpieza y política definitiva se completan en F4/F5. Stock físico se bloquea ordenadamente antes de consultar disponibilidad. Retiro consume reservas y stock una vez.

## D06. Comisión de reparto

La fórmula provisional del prototipo (80% de tarifa) se conserva exclusivamente para desarrollo mediante `COURIER_FEE_BPS=8000`, validada y configurable. Es una decisión de negocio pendiente antes de F4/piloto. Guardar el importe pactado en asignación; no usarlo como liquidación financiera real.

## D07. Contratos

API nueva usará camelCase y códigos ingleses del baseline. F0 conserva respuestas existentes cuando no impiden corrección; normalización/generación de contratos y cliente en F1. `in_transit`, `accepted`, `accepting_orders` son los códigos/columnas correctos.

F1 genera tipos de identidad desde OpenAPI y valida respuestas mediante Zod. El resto de contratos históricos se normaliza al integrar su dominio para no introducir cambios incompatibles sin consumidores reales. La caché de identidad vive en memoria, con invalidación/cancelación por generación de sesión; ningún dominio nuevo debe volcar DB en localStorage.

El baseline tampoco almacena razón social/RUC ni favoritos por producto. F0 retira campos no persistibles del DTO de alta comercial; F2 decidirá su migración. M10 necesitará migración para favoritos de producto; la tabla actual solo representa favoritos de tienda. No devolver éxito por datos que se descartan.

## D08. Harness de validación

Compilar y ejecutar SQL + HTTP sobre DB aleatoria creada por el runner. Nunca reutilizar o limpiar una DB de negocio. CI reproduce el mismo comando con PostgreSQL 17. Cambios de estado del proyecto, decisiones y evidencia quedan en `docs/harness/`.

## D09. PostgreSQL de desarrollo en Docker

El usuario aclaró que su intención es utilizar Docker y no dispone de una base de Quickly configurada fuera del contenedor. Se adopta PostgreSQL 17 en Docker como entorno principal: host `127.0.0.1:5433`, puerto interno 5432 y volumen persistente propio. No se necesita conectar ni modificar el servicio PostgreSQL que ocupa 5432 en Windows.

`npm run dev:setup` genera `.env` ignorado por Git con contraseñas locales aleatorias, sin sobrescribir configuración existente. Backend Node local usa DATABASE_URL del host; API opcional en Docker usa hostname `postgres`. Pruebas usan contenedor independiente `postgres-test`, puerto 15432, credenciales distintas y almacenamiento tmpfs. `npm run harness:docker` lo inicia, verifica y detiene sin tocar el volumen de desarrollo.

## D10. Separación de cuenta real y prototipo

`VITE_APP_MODE=real` es el valor predeterminado. Registro, login y perfil usan la API; se retira la identidad local heredada, se eliminan accesos Google/demo ficticios de esas vistas y las rutas requieren sesión/rol concedido por servidor. Las pantallas de negocio todavía no integradas presentan disponibilidad pendiente; no se permite confirmar una compra mock con identidad real.

El prototipo se conserva explícitamente con `npm run dev:demo` en puerto 5175. Sus fixtures, pruebas y operaciones locales quedan aislados del modo real. Así se mantiene la referencia visual/funcional durante F2–F8 sin una caída silenciosa a mocks ante errores de red.

## D11. Harness integrado

Comando raíz: `node scripts/check-workspace.cjs` (equivalente a backend `npm run harness:full`). Comprueba ambos proyectos y navegador real sobre DB aleatorias de PostgreSQL Docker. Los workflows de cada repositorio validan sus respectivos contratos/build/tests; el E2E conjunto requiere ambos checkouts. El nombre de DB temporal se valida antes de iniciar los servidores de navegador, evitando pruebas de escritura sobre desarrollo.
