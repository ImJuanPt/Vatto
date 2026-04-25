import { Request, Response } from "express";
import { pool } from "../../database/db";

export class RecommendationController {
  getUserRecommendations = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const result = await pool.query(
        `SELECT 
          r.id,
          r.user_id,
          r.device_id,
          r.title,
          r.description,
          r.severity_level,
          r.potential_savings_kwh,
          r.ai_model_version,
          r.action_taken,
          r.user_feedback_score,
          r.created_at,
          d.name as device_name,
          d.device_type,
          l.name as location_name
        FROM recommendations r
        LEFT JOIN devices d ON r.device_id = d.id
        LEFT JOIN locations l ON d.location_id = l.id
        WHERE (
          l.user_id = $1
          OR (r.user_id = $1 AND r.device_id IS NULL)
        )
        AND r.action_taken = FALSE
        AND r.created_at > NOW() - INTERVAL '7 days'
        ORDER BY 
          CASE r.severity_level
            WHEN 'CRITICAL' THEN 1
            WHEN 'HIGH' THEN 2
            WHEN 'WARNING' THEN 3
            WHEN 'MEDIUM' THEN 4
            ELSE 5
          END,
          r.created_at DESC
        LIMIT 20`,
        [userId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("[RecommendationController] Error:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  };

  markActionTaken = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const result = await pool.query(
        `UPDATE recommendations r
         SET action_taken = TRUE 
         WHERE r.id = $1
         AND (
           r.user_id = $2
           OR EXISTS (
             SELECT 1
             FROM devices d
             JOIN locations l ON d.location_id = l.id
             WHERE d.id = r.device_id
             AND l.user_id = $2
           )
         )
         RETURNING r.id`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Recommendation not found" });
      }

      res.json({ success: true, id });
    } catch (error) {
      console.error("[RecommendationController] Error:", error);
      res.status(500).json({ error: "Failed to update recommendation" });
    }
  };

  submitFeedback = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { score } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!score || score < 1 || score > 5) {
        return res.status(400).json({ error: "Score must be 1-5" });
      }

      const result = await pool.query(
        `UPDATE recommendations r
         SET user_feedback_score = $1 
         WHERE r.id = $2
         AND (
           r.user_id = $3
           OR EXISTS (
             SELECT 1
             FROM devices d
             JOIN locations l ON d.location_id = l.id
             WHERE d.id = r.device_id
             AND l.user_id = $3
           )
         )
         RETURNING r.id`,
        [score, id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Recommendation not found" });
      }

      res.json({ success: true, id });
    } catch (error) {
      console.error("[RecommendationController] Error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  };
}
