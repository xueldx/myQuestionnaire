import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { rateLimit } from 'express-rate-limit';
import { ConfigService } from '@nestjs/config';
import { TasksService } from '@/tasks/tasks.service';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '@/middleware/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  const tasksService = app.get(TasksService);

  const config = app.get(ConfigService);
  const isDevelopment =
    (process.env.NODE_ENV || 'development') !== 'docker';

  app.setGlobalPrefix(config.get<string>('app.prefix'));

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // 本地开发环境跳过全局限流，避免热更新和调试流量触发 429。
  if (!isDevelopment) {
    app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000,
      }),
    );
  }
  await app.listen(config.get<number>('app.port'));
}
bootstrap();
