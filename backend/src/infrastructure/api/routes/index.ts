import { Router } from 'express';
import { createReadingRoutes } from './reading.routes';
import { ReadingController } from '../controllers/ReadingController';

export const createRouter = (readingController: ReadingController): Router => {
  const router = Router();

  router.use('/readings', createReadingRoutes(readingController));
  
  // router.use('/users', createUserRoutes(userController));

  return router;
};