import { randomUUID } from 'crypto';

const MAX_REQUEST_ID_LENGTH = 128;

export const requestContext = (req, res, next) => {
  const incomingRequestId = req.get('x-request-id')?.trim();
  const requestId =
    incomingRequestId && incomingRequestId.length <= MAX_REQUEST_ID_LENGTH
      ? incomingRequestId
      : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
};
