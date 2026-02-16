import { Queue } from "bullmq";
import { IQueueService } from "../../domain/interfaces/IQueueService";
import { config } from "../../config/env";

export class BullQueueService implements IQueueService {
  private queues: Map<string, Queue> = new Map();
  private connection = { host: config.REDIS_HOST, port: config.REDIS_PORT };

  async addJob(queueName: string, data: any): Promise<void> {
    let queue = this.queues.get(queueName);

    if (!queue) {
      queue = new Queue(queueName, { connection: this.connection });
      this.queues.set(queueName, queue);
    }

    await queue.add("reading-job", data, {
      removeOnComplete: true,
      attempts: 3,
    });
  }
}
