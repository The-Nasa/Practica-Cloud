# Quickly

Workspace de desarrollo de Quickly con backend NestJS/PostgreSQL en `backend/` y prototipo React en `Frontend-Quickly/`. Cada carpeta mantiene su propio repositorio Git.

- [Plan integral por módulos y fases](PLAN_IMPLEMENTACION_BACKEND_FRONTEND.md).
- [Estado de ejecución y próximo trabajo](docs/harness/ESTADO.md).
- [Decisiones técnicas](docs/harness/DECISIONES.md).
- [Evidencia F0](docs/harness/EVIDENCIA_F0.md).
- [Evidencia F1: sesión e integración web](docs/harness/EVIDENCIA_F1.md).
- [Evidencia F2: cuentas y operación inicial](docs/harness/EVIDENCIA_F2.md).
- [Evidencia F3: catálogo e inventario](docs/harness/EVIDENCIA_F3.md).
- [Evidencia F4: compra a entrega en efectivo](docs/harness/EVIDENCIA_F4.md).
- [Evidencia F5: soporte, notificaciones y reportes](docs/harness/EVIDENCIA_F5.md).
- [Reglas de compras multitienda F7](docs/harness/OPERACION_F7.md).
- [Evidencia F7 multitienda](docs/harness/EVIDENCIA_F7.md).
- [Operación y preparación F8](docs/harness/OPERACION_F8.md), [checklist de piloto](docs/harness/CHECKLIST_PILOTO_F8.md) y [seguimiento de seguridad](docs/harness/SEGURIDAD_F8.md).
- [Evidencia F8: preparación local y pendientes de lanzamiento](docs/harness/EVIDENCIA_F8.md).
- [Instrucciones del backend](backend/README.md) y [harness reproducible](backend/test/README.md).

F0–F5 están completadas localmente. Desde `backend/`, usar `npm run dev:setup`, `npm run dev:db` y `npm run start:dev`. Desde `Frontend-Quickly/`, usar `npm ci` y `npm run dev`; abrir `http://localhost:5173`. Sesión, perfiles, catálogo/inventario, compra/entrega en efectivo, soporte, favoritos/reseñas, notificaciones y reportes usan la API con cookie HttpOnly y PostgreSQL Docker en `127.0.0.1:5433`. El prototipo anterior queda disponible con `npm run dev:demo` en puerto 5175.

El trabajo por fases usa `AGENTS.md`, decisiones registradas y `node scripts/check-workspace.cjs` como verificación integral de backend, contratos, frontend y navegador con DB aisladas. F7 incorpora compras de varias tiendas con envíos/cobros independientes. F6/pasarela y las demás ampliaciones F7 (Google, GPS, promociones, carrito remoto y liquidaciones) quedan pendientes por decisión del usuario. F8, despliegue y piloto conservan su verificación propia.
