// Vercel serverless entry: every /api/* request is routed here (see vercel.json).
// The Express app handles the full path, exactly as it does locally with `npm run server`.
import app from '../server.js';

export default app;
