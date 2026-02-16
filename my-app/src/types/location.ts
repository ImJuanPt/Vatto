export interface Location {
  id: number | string;
  userId: number | string;
  name?: string;
  address?: string;
  timezone?: string;
  createdAt?: string;
}

export default Location;
