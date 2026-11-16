# Revisión de dependencias F8

La auditoría npm detectó vulnerabilidades reales en dependencias de los lockfiles, incluidas de producción. Se ejecutó `npm audit fix --package-lock-only --ignore-scripts` para actualizar dentro de los rangos compatibles y se verifica el código con esos lockfiles. Persisten hallazgos; F8 no acredita seguridad completa ni habilita publicación a usuarios reales.

Resultado residual de `npm audit --omit=dev --json` después de instalar los lockfiles: backend 11 paquetes afectados (5 altos, 6 moderados), frontend 3 (1 alto, 2 moderados), sin críticos de producción en esa consulta. El inventario completo también incluye hallazgos críticos en herramientas de desarrollo. Ambos audits de producción terminan con código 1; no se consideran aprobados. Los conteos corresponden a paquetes que reporta npm y pueden compartir el mismo aviso transitivo.

Familias que requieren resolver/revisar antes de publicación:

- Backend: NestJS/plataforma Express y transitivas como body-parser/multer, js-yaml/lodash. npm propone versiones mayores de Nest para parte de los hallazgos. No se migró el framework mayor en este bloque operativo ni se declaró inaccesible una vulnerabilidad por no usar una pantalla.
- Frontend: React Router y Zod con hallazgos de producción; npm propone migraciones mayores. Vite se actualiza dentro de su rama compatible. Revisar también herramientas de desarrollo/pruebas (Vitest/tinypool y transitivas) antes de exponer entornos de desarrollo o ejecutar aportes no confiables.

Los avisos de npm son un inventario de paquetes afectados, no un conteo de ataques o demostración de explotación en Quickly. Debe evaluarse alcance y aplicar versiones corregidas; CSP/límites/cabeceras no sustituyen la corrección de dependencias. No publicar por el solo hecho de que compilación y recorridos pasen.

Próximo bloque técnico de seguridad: seleccionar versiones soportadas de Nest/Express/Swagger/config y Router/Zod/Vitest; leer sus guías oficiales de migración, actualizar contratos/validadores y ejecutar el harness completo más HTTPS/restauración. Cerrar auditoría con los lockfiles finales y registrar cualquier riesgo residual con decisión explícita, sin ignorar silenciosamente el código de salida.

Comandos reproducibles: `npm audit --omit=dev` para dependencias de producción y `npm audit` para inventario completo, en cada repositorio. Conservar fecha, versión/lockfile y salida resumida; el registro de avisos puede cambiar con nuevas publicaciones.

Referencias primarias consultadas: [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [React Router](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m). Esta lista orienta el seguimiento y no sustituye la salida actual de npm.
