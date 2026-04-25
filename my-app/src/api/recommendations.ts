import api from './client';

export interface RecommendationResponse {
  id: number;
  user_id: number;
  device_id: number;
  title: string;
  description: string;
  severity_level: string;
  potential_savings_kwh?: number | string;
  ai_model_version?: string;
  action_taken: boolean;
  user_feedback_score?: number;
  created_at: string;
  device_name?: string;
  device_type?: string;
  location_name?: string;
}

export const getRecommendations = async (): Promise<RecommendationResponse[]> => {
  try {
    return await api.get<RecommendationResponse[]>('/v1/recommendations');
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return [];
  }
};

export const markRecommendationAction = async (id: number): Promise<void> => {
  try {
    await api.patch(`/v1/recommendations/${id}/action`, {});
  } catch (error) {
    console.error('Error marking recommendation action:', error);
    throw error;
  }
};

export const submitRecommendationFeedback = async (
  id: number,
  score: number
): Promise<void> => {
  try {
    await api.post(`/v1/recommendations/${id}/feedback`, { score });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    throw error;
  }
};
