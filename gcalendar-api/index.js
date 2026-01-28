import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import cors from 'cors';
import analyzer from './router/analyzer.js'

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;


// Middleware
app.use(cors());
app.use(express.json());

// Routers
app.use('/analyze', analyzer);

// Start Server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});