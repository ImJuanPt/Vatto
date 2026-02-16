import { Router } from "express";
import { ReadingController } from "../controllers/ReadingController";

export const createReadingRoutes = (controller: ReadingController): Router => {
  const router = Router();

  router.post("/", controller.receiveReading);
  router.get('/latest/:deviceId', controller.getLatest);
  router.get('/device/:deviceId', controller.getHistory);
  // router.get('/history/:deviceId', controller.getHistory);

  return router;
};
