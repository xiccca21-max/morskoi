import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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
      return res.status(status).json(exception.getResponse());
    }

    this.logger.error(
      `Unhandled error on ${req.method} ${req.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Внутренняя ошибка сервера. Попробуйте позже.',
    });
  }
}
