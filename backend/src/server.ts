import express from "express";
import http from "http";
import cors from "cors";
import { config } from "./config/env";
import { Router } from "express";

import { SocketIoGateway } from "./infrastructure/websocket/SocketIoGateway";
import { BullQueueService } from "./infrastructure/queue/BullQueueService";
import { authMiddleware } from "./infrastructure/api/middlewares/AuthMiddleware";
import { DeviceCleanupScheduler } from "./infrastructure/scheduler/DeviceCleanupScheduler";

import { PostgresReadingRepository } from "./infrastructure/database/PostgresReadingRepo";
import { PostgresDeviceRepository } from "./infrastructure/database/PostgresDeviceRepo";
import { PostgresLocationRepository } from "./infrastructure/database/PostgresLocationRepo";
import { PostgresUserRepo } from "./infrastructure/database/PostgresUserRepo";

import { ReadingWorker } from "./infrastructure/queue/ReadingWorker";

import { createDeviceRoutes } from "./infrastructure/api/routes/device.routes";
import { createReadingRoutes } from "./infrastructure/api/routes/reading.routes";
import { createLocationRoutes } from "./infrastructure/api/routes/location.routes";
import { createAuthRoutes } from "./infrastructure/api/routes/auth.routes";
import { createRecommendationRoutes } from "./infrastructure/api/routes/recommendation.routes";
import { createDeferredLinkRoutes } from "./infrastructure/api/routes/deferred-link.routes";

import { ReadingController } from "./infrastructure/api/controllers/ReadingController";
import { DeviceController } from "./infrastructure/api/controllers/DeviceController";
import { LocationController } from "./infrastructure/api/controllers/LocationController";
import { AuthController } from "./infrastructure/api/controllers/AuthController";
import { RecommendationController } from "./infrastructure/api/controllers/RecommendationController";
import { DeferredLinkController } from "./infrastructure/api/controllers/DeferredLinkController";
import { DeferredLinkStore } from "./infrastructure/database/DeferredLinkStore";

import { ProcessReadingUseCase } from "./application/use-cases/ProcessReadingUseCase";
import { ProcessDeviceUseCase } from "./application/use-cases/ProcessDeviceUseCase";
import { ProcessLocationUseCase } from "./application/use-cases/processLocationUseCase";
import { ProcessAuthUseCase } from "./application/use-cases/ProcessAuthUseCase";

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // Use X-Forwarded-* headers from nginx to resolve real client IPs
  app.set('trust proxy', true);

  app.use(express.json());

  const corsOrigins = config.CORS_ALLOWED_ORIGINS;
  if (corsOrigins && Array.isArray(corsOrigins) && corsOrigins.length > 0) {
    app.use(
      cors({
        origin: (origin, callback) => {
          // Permitir peticiones sin origen (curl, apps nativas)
          if (!origin) return callback(null, true);
          if (corsOrigins.includes(origin)) return callback(null, true);
          return callback(new Error('CORS origin not allowed'));
        },
        methods: ['GET','POST','PUT','DELETE','OPTIONS']
      })
    );
    console.log('CORS enabled for origins:', corsOrigins);
  } else {
    app.use(cors());
    console.log('CORS enabled permissively (no CORS_ALLOWED_ORIGINS set)');
  }

  const socketGateway = new SocketIoGateway(server);
  const queueService = new BullQueueService();

  const readingRepo = new PostgresReadingRepository();
  const deviceRepo = new PostgresDeviceRepository();
  const locationRepo = new PostgresLocationRepository();
  const userRepo = new PostgresUserRepo();

  const processReadingUseCase = new ProcessReadingUseCase(readingRepo, socketGateway, deviceRepo);
  const processDeviceUseCase = new ProcessDeviceUseCase(deviceRepo, socketGateway);
  const processLocationUseCase = new ProcessLocationUseCase(locationRepo, socketGateway);
  const processAuthUseCase = new ProcessAuthUseCase(userRepo);

  new ReadingWorker(processReadingUseCase);

  const readingController = new ReadingController(queueService, readingRepo, deviceRepo);
  const deviceController = new DeviceController(processDeviceUseCase);
  const locationController = new LocationController(processLocationUseCase);
  const authController = new AuthController(processAuthUseCase);
  const recommendationController = new RecommendationController();
  const deferredLinkStore = new DeferredLinkStore();
  const deferredLinkController = new DeferredLinkController(deferredLinkStore);

  // Iniciar scheduler para limpiar dispositivos sin pairing después de 60 minutos
  const deviceCleanupScheduler = new DeviceCleanupScheduler(deviceRepo);
  deviceCleanupScheduler.start();

  // Exponer endpoint de emparejamiento sin autenticacion para que dispositivos ESP32 puedan llamarlo durante configuracion
  app.post('/api/v1/devices/pair', (req, res) => deviceController.pair(req as any, res as any));

  // Exponer endpoint de lecturas sin autenticacion para que dispositivos ESP32 puedan enviar datos de sensores
  app.post('/api/v1/readings', (req, res) => readingController.receiveReading(req as any, res as any));

  app.use('/api/v1/auth', createAuthRoutes(authController));
  app.use('/api/v1/deferred-links', createDeferredLinkRoutes(deferredLinkController));

  const protectedRouter = Router();
  protectedRouter.use(authMiddleware);

  protectedRouter.use("/readings", createReadingRoutes(readingController));
  protectedRouter.use("/devices", createDeviceRoutes(deviceController));
  protectedRouter.use("/locations", createLocationRoutes(locationController));
  protectedRouter.use("/recommendations", createRecommendationRoutes(recommendationController));

  app.use('/api/v1', protectedRouter);

  const listenPort = parseInt(String(config.PORT), 10);
  server.listen(listenPort, '0.0.0.0', () => {
    console.log(`🚀 Servidor IoT corriendo en puerto ${listenPort}`);
    console.log(`📡 Sockets listos`);
    console.log(`bullmq Workers escuchando redis en ${config.REDIS_HOST}`);
    console.log(`✅ Pairing endpoint disponible: POST /api/v1/devices/pair (sin auth)`);
  });
}

bootstrap().catch(console.error);
