import express from 'express';
import cors from 'cors';
import { registerRoutes } from '../server/routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

await registerRoutes(app);

export default app;
