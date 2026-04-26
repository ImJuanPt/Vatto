import { Router } from 'express';
import { DeferredLinkController } from '../controllers/DeferredLinkController';

export const createDeferredLinkRoutes = (controller: DeferredLinkController): Router => {
  const router = Router();

  // Public endpoints for QR landing and app bootstrap
  router.post('/register', controller.register);
  router.get('/resolve-latest', controller.resolveLatest);
  router.post('/resolve', controller.resolve);
  router.post('/consume', controller.consume);

  // Optional maintenance endpoint (can be protected later)
  router.post('/cleanup', controller.cleanup);

  return router;
};
