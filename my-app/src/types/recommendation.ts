export interface Recommendation {
  id?: number | string;
  userId?: number | string;
  deviceId?: number | string;
  title?: string;
  description?: string;
  severityLevel?: string;
  potentialSavingsKwh?: number;
  aiModelVersion?: string;
  userFeedbackScore?: number;
  actionTaken?: boolean;
  createdAt?: string;
}

export default Recommendation;
