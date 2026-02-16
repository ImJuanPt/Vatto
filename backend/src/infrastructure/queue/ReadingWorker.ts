import { Worker } from "bullmq";
import { config } from "../../config/env";
import { ProcessReadingUseCase } from "../../application/use-cases/ProcessReadingUseCase";

export class ReadingWorker {
  private worker: Worker;

  constructor(private processReadingUseCase: ProcessReadingUseCase) {
    this.worker = new Worker(
      "readings_queue",
      async (job) => {
        await this.processReadingUseCase.execute(job.data);
      },
      {
        connection: { host: config.REDIS_HOST, port: config.REDIS_PORT },
      }
    );

    this.worker.on("failed", (job, err) => {
      console.error(`[Worker] Error en job ${job?.id}: ${err.message}`);
    });
  }
}
