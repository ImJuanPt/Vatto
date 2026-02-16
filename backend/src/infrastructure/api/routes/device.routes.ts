import { Router } from "express";
import { DeviceController } from "../controllers/DeviceController";

export const createDeviceRoutes = (controller: DeviceController): Router => {
  const router = Router();

  router.get("/", controller.list);
  router.get("/daily-usage", controller.dailyUsage);
  router.get("/metrics", controller.metrics);
  router.get("/:id", controller.findById);
  router.get('/by-mac/:mac', controller.getByMac);

  router.post("/", controller.create);
  router.post("/pair", controller.pair); // POST /api/v1/devices/pair para emparejar ESP32
  router.post("/:id/move", controller.moveDevice); // POST /api/v1/devices/:id/move para mover dispositivo

  router.put("/:id", controller.edit);

  router.delete("/:id", controller.delete);

  return router;
};
