# Plan de trabajo: adaptar el prototipo a las API y preparar el catálogo

Estado: etapas 1 y 2 implementadas y verificadas localmente; etapas 3/4 de datos pendientes de elegir destino y contenido. Evidencia: `docs/harness/EVIDENCIA_PORTADA.md`, mapa: `docs/harness/MAPEO_PORTADA.md`. Cierre integral aprobado (242 pruebas); el plan completo todavía no se declara terminado. Se reutiliza el frontend del prototipo y se conectan sus componentes con las API existentes, retirando progresivamente lo que no corresponda.

## 1. Objetivo

Conservar la presentación visual del prototipo de Quickly y adaptar su página principal para consumir el catálogo de PostgreSQL mediante las API existentes. Reutilizar los clientes HTTP, contratos, permisos, carrito real y recuperación de compra ya implementados. Preparar después una carga de datos repetible para revisar la aplicación con contenido consistente.

La base visual será `HomePage.tsx` y sus componentes del prototipo: verde Quickly, verde oscuro/carbón, superficies claras y tarjetas de comercios/productos. La base funcional será la integración real actual: catálogo, búsquedas, filtros, detalle, favoritos, carrito y compra conectados. Cada componente conservará su presentación y sustituirá su dependencia de mocks/stores simulados por los contratos y servicios reales correspondientes.

## 2. Estado antes de ejecutar este plan

- Ya se revisaron la portada real, el prototipo, los contratos públicos y las pruebas existentes.
- Existe un borrador nuevo sin integrar en `Frontend-Quickly/src/features/catalog/CatalogLanding.tsx`. No forma parte del enfoque elegido: se reutilizará el prototipo existente. Se podrá retirar ese borrador al ejecutar la limpieza de implementación.
- No se han cargado datos ni cambiado la conexión de la DB para esta tarea.
- Hay cambios locales de fases anteriores que deben conservarse. No se harán commits, merges, pushes ni despliegues como parte de este plan sin instrucción del usuario.

## 3. Alcance visual propuesto

Se adapta el diseño existente; las modificaciones visuales se limitan a acomodar datos reales, navegación, estados de red y capacidades disponibles. El proceso será componente por componente, empezando por la portada. Los módulos posteriores se revisarán cuando el alcance requiera conectarlos o retirar una duplicación.

| Sección | Trabajo | Comportamiento esperado |
| --- | --- | --- |
| Encabezado | Reutilizar la presentación del prototipo con sesión, roles y carrito reales | Accesos claros según sesión/rol y navegación usable sin desbordamiento |
| Presentación principal | Conservar la composición/recursos del prototipo y ajustar textos y destinos | Mensajes y acciones acordes con lo implementado |
| Categorías | Conectar las tarjetas o botones existentes con las categorías reales | Categorías de la API; elegir una aplica el filtro real |
| Catálogo | Adaptar las tarjetas, grilla y vista rápida del prototipo a DTO reales | Búsqueda, precios, stock, favoritos, selección SKU y paginación conservan su funcionamiento |
| Comercios | Conectar las secciones existentes con negocios disponibles, logo, zona y estado | Datos del servidor y acceso a sus productos |
| Afiliación | Bloque visual para incorporar comercios | Enlace al formulario real de solicitud |
| Pie de página | Presentación consistente y enlaces útiles | Navegación clara con información vigente |
| Estados | Diseñar carga, vacío, error y reintento | Una falla HTTP se comunica; el catálogo vacío tiene una presentación cuidada |

El contenido comercial debe representar capacidades actuales: pago en efectivo y compra multitienda con envío/cobro independientes por tienda. Descuentos, tiempos prometidos, calificaciones, sellos o cantidades solo se mostrarán cuando procedan de información disponible y verificable.

## 4. Etapas y entregables

### Etapa 1 — Mapeo del prototipo y las API

1. Inventariar secciones/componentes de `HomePage.tsx`, sus fuentes mock y sus acciones.
2. Mapear cada uno a los clientes HTTP, DTO y componentes funcionales reales ya existentes.
3. Clasificar las secciones: conectar, ajustar o retirar/dejar pendientes. Conservar imágenes y tokens del prototipo cuando correspondan.

**Entregable:** mapa componente → API/DTO → acción real y lista de elementos que se retirarán o ajustarán.

**Aceptación:** portada con una jerarquía clara: presentación → categorías → catálogo → comercios → afiliación.

### Etapa 2 — Adaptación e integración progresiva

1. Adaptar categorías y comercios del prototipo a los datos reales de las API.
2. Adaptar productos, variantes/precios, imágenes, favoritos y vista rápida; conectar acciones al carrito real.
3. Conectar encabezado/cuenta/navegación con sesión y permisos actuales; mantener enlaces a los recorridos reales de compra y afiliación.
4. Incorporar carga, vacío, error y reintento en cada sección; mantener su independencia cuando corresponda.
5. Ajustar textos/acciones de promociones, sellos, pagos digitales, GPS y estadísticas sin respaldo. Mostrar únicamente capacidades vigentes.
6. Verificar móvil, tablet, escritorio, teclado y contraste.
7. Tras verificar cada sustitución, retirar imports, mocks, ramas o componentes duplicados que hayan quedado sin uso. Confirmar sus consumidores antes de eliminarlos y documentar si se conserva temporalmente el modo demo.

**Entregable:** página principal con la presentación del prototipo y comportamiento HTTP real, con limpieza progresiva de código sustituido.

**Aceptación:** categorías/búsqueda/paginación/vista rápida/favoritos/carrito funcionan; el contenido se adapta a celular sin desplazamiento horizontal accidental.

### Etapa 3 — Definir y preparar los datos

Antes de cargar, elegir una de estas alternativas:

| Alternativa | Datos necesarios | Destino |
| --- | --- | --- |
| Catálogo de demostración | Comercios/productos identificados como demostración, cuentas sintéticas y stock de ejemplo | DB de demostración separada, con instrucciones de inicio y accesos locales protegidos |
| Catálogo real | Comercios/propietarios, cobertura, contactos, horarios, productos/SKU, precios, existencias e imágenes proporcionados por el responsable | Base de desarrollo u operativa expresamente elegida; revisar datos y respaldo previo según corresponda |

Datos mínimos a preparar:

- Zonas: nombre, descripción, tarifa de envío y tiempo estimado configurado.
- Comercios: propietario registrado, nombre, giro, contacto, dirección, zona, horario y estado de habilitación.
- Productos: comercio, categoría, nombre y descripción; marca cuando exista.
- SKU: código único, presentación y precio en céntimos.
- Inventario: existencia inicial y su movimiento correspondiente.
- Imágenes: archivos admitidos por el adaptador, referencias válidas, logo/banner cuando estén disponibles.

La carga respeta relaciones, restricciones, permisos y reglas de habilitación. Las existencias iniciales deben quedar consistentes con el inventario. No se generarán compras, entregas, cobros, reseñas ni estadísticas históricas ficticias para dar apariencia de actividad.

**Entregable:** conjunto de datos y mecanismo de carga definidos, con destino explícito.

**Aceptación:** datos completos, identificadores/relaciones correctos, precios válidos y cantidades revisadas antes de ejecutar la carga.

### Etapa 4 — Carga repetible y verificación

1. Implementar el mecanismo de carga elegido y sus validaciones.
2. Prevenir duplicados al repetir la ejecución; preservar registros existentes.
3. Ejecutarlo primero sobre una DB aislada y verificar conteos, relaciones, imágenes y stock.
4. Aplicar al destino acordado y revisar el resultado desde la portada y las pantallas comerciales.
5. Documentar cómo iniciar, repetir y mantener ese catálogo.

**Entregable:** catálogo visible en la aplicación y carga documentada.

**Aceptación:** ejecutar otra vez no duplica datos, todas las imágenes referenciadas existen y se puede recorrer producto → carrito → cotización con precios/stock del servidor.

### Etapa 5 — Validación y entrega

1. Compilar frontend y ejecutar pruebas relevantes de catálogo/carrito.
2. Comprobar PostgreSQL mediante integración si se agrega carga de datos.
3. Revisar la portada en navegador: escritorio y móvil, con catálogo poblado y vacío.
4. Verificar búsquedas, filtros, comercios, vista rápida, favoritos y compra única/multitienda.
5. Ejecutar el cierre adecuado al alcance, conservar resultados aprobados y corregir los bloques que fallen.
6. Actualizar estado/evidencia del harness, documentación de relevo y capturas de la presentación final.

**Entregable:** resultado visual revisado, datos verificados y evidencia reproducible.

## 5. Criterios para dar este trabajo por terminado

- Portada con la presentación del prototipo de Quickly y sus componentes conectados a las API reales.
- Navegación y catálogo utilizables en móvil y escritorio.
- Categorías, comercios, productos, precios y stock provenientes de HTTP/PostgreSQL.
- Conjunto de datos identificado, cargado al destino elegido y verificable.
- Repetición de la carga sin duplicados ni sobrescritura de datos ajenos.
- Recorridos existentes funcionando y errores/vacíos bien presentados.
- Compilación, comprobaciones pertinentes y evidencia documentadas.

## 6. Decisión pendiente antes de la carga

Confirmar si se usará catálogo de demostración separado o datos reales proporcionados por el responsable. La recomendación inicial es usar un catálogo de demostración separado para revisar el diseño y los recorridos, y preparar la carga real cuando se disponga de la información final.

Los pendientes de lanzamiento registrados en F8 (seguridad de dependencias, infraestructura pública, políticas de efectivo y piloto) conservan su seguimiento propio; esta mejora visual y carga de catálogo no los declara resueltos.

## 7. Orden acordado

Primero mapear y adaptar la portada del prototipo; después verificar recorridos y retirar lo sustituido; finalmente preparar/cargar los datos al destino elegido. La carga mantiene pendiente la decisión entre demostración separada y catálogo real proporcionado por el responsable.
