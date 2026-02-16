import { Router } from "express";
import { LocationController } from "../controllers/LocationController";

export const createLocationRoutes = (controller: LocationController): Router => {
  const router = Router();

  router.get("/", controller.list);
  router.get("/:id", controller.findById);

  router.post("/", controller.create);

  router.put("/:id", controller.edit);

  router.delete("/:id", controller.delete);

  return router;
};
