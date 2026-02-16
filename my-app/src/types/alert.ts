export interface Alert {
  id?: number | string;
  deviceId?: number | string;
  alertType?: string;
  message?: string;
  valueRecorded?: number;
  isRead?: boolean;
  createdAt?: string;
}

export default Alert;
