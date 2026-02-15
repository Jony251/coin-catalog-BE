const isProduction = process.env.NODE_ENV === 'production';

const normalizeStatusCode = (error) => {
  if (error?.type === 'entity.too.large') return 413;

  const statusCode = Number.parseInt(error?.statusCode, 10);
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
    return statusCode;
  }

  return 500;
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = normalizeStatusCode(err);
  const requestId = req?.requestId;

  const shouldExposeMessage = !isProduction || statusCode < 500;
  const fallbackMessage = statusCode === 413 ? 'Request payload is too large' : 'Internal Server Error';
  const message = shouldExposeMessage ? err?.message || fallbackMessage : fallbackMessage;

  const logPrefix = requestId ? `[request:${requestId}]` : '[request:unknown]';
  if (statusCode >= 500) {
    console.error(`${logPrefix} Unhandled error`, err);
  } else {
    console.warn(`${logPrefix} Handled error: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(err?.details && { details: err.details }),
    ...(requestId && { requestId }),
    ...(!isProduction && { stack: err?.stack }),
  });
};

export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

export class AppError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
