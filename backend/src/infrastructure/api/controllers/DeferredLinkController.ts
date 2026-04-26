import { Request, Response } from 'express';
import { DeferredLinkStore } from '../../database/DeferredLinkStore';

function extractClientIp(req: Request): string | null {
  const forwardedFor = req.headers['x-forwarded-for'];
  const headerValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;

  if (headerValue) {
    const firstIp = headerValue.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return req.ip || req.socket.remoteAddress || null;
}

function sanitizeMac(mac: string): string {
  return mac.trim().toUpperCase().replace(/-/g, ':');
}

export class DeferredLinkController {
  constructor(private deferredLinkStore: DeferredLinkStore) {}

  register = async (req: Request, res: Response) => {
    try {
      const mac = String(req.body?.mac ?? '').trim();
      const model = String(req.body?.model ?? '').trim();

      if (!mac) {
        return res.status(400).json({ error: 'Missing mac' });
      }

      const validMac = /([0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5})/.test(mac.replace(/-/g, ':'));
      if (!validMac) {
        return res.status(400).json({ error: 'Invalid mac format' });
      }

      const record = await this.deferredLinkStore.register({
        macAddress: sanitizeMac(mac),
        model: model || undefined,
        sourceIp: extractClientIp(req) ?? undefined,
        userAgent: req.headers['user-agent'] ?? undefined,
        ttlMinutes: 180,
      });

      return res.status(201).json({
        id: record.id,
        code: record.code,
        mac: record.macAddress,
        model: record.model,
        expiresAt: record.expiresAt,
      });
    } catch (error) {
      console.error('[DeferredLinkController.register]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };

  resolveLatest = async (req: Request, res: Response) => {
    try {
      const sourceIp = extractClientIp(req);
      if (!sourceIp) {
        return res.status(200).json({ found: false });
      }

      const record = await this.deferredLinkStore.resolveLatestByIp(sourceIp);
      if (!record) {
        return res.status(200).json({ found: false });
      }

      return res.status(200).json({
        found: true,
        id: record.id,
        code: record.code,
        mac: record.macAddress,
        model: record.model,
        expiresAt: record.expiresAt,
      });
    } catch (error) {
      console.error('[DeferredLinkController.resolveLatest]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };

  resolve = async (req: Request, res: Response) => {
    try {
      const id = String(req.body?.id ?? '').trim() || undefined;
      const code = String(req.body?.code ?? '').trim() || undefined;

      if (!id && !code) {
        return res.status(400).json({ error: 'Missing id or code' });
      }

      const record = await this.deferredLinkStore.resolveByIdOrCode({ id, code });
      if (!record) {
        return res.status(404).json({ error: 'Deferred link not found or expired' });
      }

      return res.status(200).json({
        id: record.id,
        code: record.code,
        mac: record.macAddress,
        model: record.model,
        expiresAt: record.expiresAt,
      });
    } catch (error) {
      console.error('[DeferredLinkController.resolve]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };

  consume = async (req: Request, res: Response) => {
    try {
      const id = String(req.body?.id ?? '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Missing id' });
      }

      const consumed = await this.deferredLinkStore.consumeById(id);
      if (!consumed) {
        return res.status(404).json({ error: 'Deferred link not found, expired or already consumed' });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[DeferredLinkController.consume]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };

  cleanup = async (_req: Request, res: Response) => {
    try {
      await this.deferredLinkStore.cleanupExpired();
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[DeferredLinkController.cleanup]', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}
