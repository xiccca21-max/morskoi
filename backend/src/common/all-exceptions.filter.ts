import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Sentry, sentryEnabled } from '../instrument';

/**
 * Глобальный фильтр исключений.
 * - HttpException отдаёт как есть (бизнес-ошибки с понятным message).
 * - Любую другую ошибку логируем на сервере, а клиенту отдаём обобщённое
 *   сообщение без стектрейса/внутренних деталей (защита от утечек).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // В Sentry шлём только серверные (5xx) ошибки — клиентские 4xx это
      // ожидаемые бизнес-ошибки (нехватка баланса и т.п.), шум не нужен.
      if (sentryEnabled && status >= 500) Sentry.captureException(exception);
      return res.status(status).json(exception.getResponse());
    }

    this.logger.error(
      `Unhandled error on ${req.method} ${req.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    if (sentryEnabled) Sentry.captureException(exception);

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Внутренняя ошибка сервера. Попробуйте позже.',
    });
  }
}
