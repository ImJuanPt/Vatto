export interface IQueueService {
  addJob(queueName: string, data: any): Promise<void>;
}