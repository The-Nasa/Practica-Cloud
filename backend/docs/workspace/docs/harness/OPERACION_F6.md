# F6: pagos digitales — inicio y decisiones pendientes

Estado: iniciada, no completada. El proveedor y los métodos digitales siguen pendientes de elección del usuario. No se habilita pago digital ni se presenta un simulador local como sandbox de una pasarela.

## Base independiente del proveedor

Módulo `billing` con consultas sobre los hechos existentes:

- `GET /api/v1/payment-methods`: catálogo con disponibilidad explícita. Solo `cash` disponible; la presencia de `card`/`yape_plin` en SQL no acredita integración.
- `GET /api/v1/me/purchases/:id/payments`: sesión obligatoria y compra propia; terceros y recursos inexistentes reciben 404. Paginación UUID con `limit` 1–100, predeterminado 25. Importes en céntimos, estados/fechas persistidos y resumen de reembolsos por intento. Cabecera `no-store`; no se devuelven referencias privadas del proveedor, payloads externos, claves de reembolso ni identidad del cobrador.

Estas consultas no crean ni confirman cobros o reembolsos. No cambian el checkout efectivo de F4 ni requieren migración. La suite dirigida `node scripts/harness-docker.cjs --suite=f6` crea una DB aleatoria y se incluye también en el harness completo.

Verificación de este bloque: 5/5 escenarios HTTP/PostgreSQL, código 0; compilaciones backend/frontend, exportación OpenAPI y tipos sincronizados. DB temporal eliminada y servicio de pruebas detenido. No se atribuye este resultado a la integración financiera ni al cierre integral de F6.

## Decisiones necesarias

1. Proveedor y métodos realmente admitidos por su integración: tarjeta, Yape, Plin u otros. Comprobar documentación oficial antes de implementar; no asumir que un QR confirma cobro.
2. Cuenta sandbox habilitada y credenciales exclusivamente en configuración local/secretos. No enviar claves por chat ni almacenarlas en Git.
3. Topología de checkout alojado/SDK y endpoint público HTTPS para webhook sandbox cuando el proveedor lo requiera. Redirección del navegador nunca confirma pago.

## Secuencia de implementación después de elegir proveedor

1. Adaptador con creación, consulta y reembolso idempotentes; validación de entorno, moneda/importes y URLs permitidas. Ningún PAN/CVV pasa por Quickly.
2. Migración aditiva según necesidades reales del proveedor: identificación única de operación/evento, moneda, estado de reconciliación y comandos durables con reintentos/concesiones. No editar baseline ni migraciones aplicadas.
3. Crear compra pendiente y reserva con plazo coordinado con pago. Crear intento/checkout fuera de locks; conservar resultado incierto ante timeout y consultar antes de intentar otro cobro. Aceptación comercial solo tras pago verificado.
4. Webhook auténtico conforme a documentación del proveedor (firma/cuerpo original y/o consulta autoritativa). Deduplicación durable y validación de referencia, compra, monto, moneda, entorno y transición. No registrar secretos o payloads financieros completos.
5. Coordinación con cancelación/rechazo/vencimiento: liberar reservas una vez y solicitar devolución de cobro tardío de un pedido que ya no puede operarse. Los estados terminales actuales requieren política/migración explícita para registrar cobros tardíos; no ignorarlos por un estado local cancelado.
6. Reembolso íntegro de pedido cancelado/rechazado con pago digital cobrado, conforme a restricciones SQL. Motivo y permisos administrativos; idempotencia, conciliación y reintentos seguros. Devolución pendiente no equivale a dinero devuelto. Parciales/postentrega requieren alcance adicional explícito.
7. Coordinar el consumo de eventos: F5 usa `published_at` como acuse del canal interno, incluso para eventos sin notificación. Usar seguimiento independiente por consumidor o comandos propios de billing; no permitir que el worker de avisos descarte una tarea financiera.
8. Checkout real consulta capacidades y usa checkout alojado/SDK; retorno y detalle muestran estado confirmado por API. Administración consulta pendientes/fallos y solicita conciliación/reembolso autorizado; nunca decide éxito financiero desde el navegador.
9. Actualizar OpenAPI, tipos generados, documentación operativa y evidencia. Validar API/PostgreSQL, frontend, navegador y sandbox externo; F6 solo cierra tras cobro y devolución confirmados por el servidor del proveedor.

## Matriz mínima del harness

Conservar F0–F5 y efectivo. Añadir pago válido, fallido y cancelado, expiración, webhook inválido/duplicado/fuera de orden, monto/moneda/referencia incorrectos, retorno manipulado, timeout y recuperación, concurrencia webhook/cancelación/vencimiento, cobro tardío, reembolso concurrente/repetido/fallido y posterior conciliación. Caída entre llamada HTTP y commit no debe duplicar cobro/devolución; auditoría y eventos de estado deben revertir juntos si falla SQL.

Pruebas locales de contratos con fixtures no acreditan por sí solas integración sandbox externa. Conservar como pendientes los bloques que requieren cuenta o endpoint público y distinguir su evidencia.
