import { Response } from 'express';

export const initSseResponse = (res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
};

export const writeSseEvent = (
  res: Response,
  event: string,
  data: Record<string, any>,
) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};
