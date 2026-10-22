import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

registerRoutes(app);

const PORT = Number(process.env.PORT || 5174);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[FolioProspect API] listening on http://127.0.0.1:${PORT}`);
});
