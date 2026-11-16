import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './platform/openapi';
import { AppModule } from './app.module';
import { configureHttp } from './platform/configure-http';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  configureHttp(app);
  app.enableShutdownHooks();

  // OpenAPI / Swagger Documentation
  const document = createOpenApiDocument(app);
  if (process.env.NODE_ENV !== 'production') SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  const server = app.getHttpServer();
  server.requestTimeout = 30000;
  server.headersTimeout = 35000;
  server.keepAliveTimeout = 5000;
  logger.log(`Quickly Backend API running on port ${port}`);
  if (process.env.NODE_ENV !== 'production') logger.log(`OpenAPI documentation available at http://localhost:${port}/api/docs`);
}

bootstrap().catch(() => { Logger.error('No se pudo iniciar la API. Revise configuración y dependencias sin publicar secretos.', 'Bootstrap'); process.exitCode = 1; });
