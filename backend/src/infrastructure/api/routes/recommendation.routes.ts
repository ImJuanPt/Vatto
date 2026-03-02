import { Router } from "express";
import { RecommendationController } from "../controllers/RecommendationController";

export const createRecommendationRoutes = (
  controller: RecommendationController
): Router => {
  const router = Router();

  router.get("/", controller.getUserRecommendations);
  router.patch("/:id/action", controller.markActionTaken);
  router.post("/:id/feedback", controller.submitFeedback);

  return router;
};
