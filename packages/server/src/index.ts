import express from 'express';
import cors from 'cors';
import { initDb, closeDb } from './db.js';
import api from './api.js';

const PORT = parseInt(process.env.PORT ?? '10110', 10);
const DB_PATH = process.env.DB_PATH ?? './determinant.db';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];

const app = express();

const corsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use('/api', api);

app.listen(PORT, () => {
  console.log(`Determinant server running on port ${PORT}`);
  initDb(DB_PATH);
});

process.on('SIGINT', () => {
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDb();
  process.exit(0);
});