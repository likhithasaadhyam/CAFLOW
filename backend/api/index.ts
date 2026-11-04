import app from '../src/index.js';

export default function handler(req: any, res: any) {
  try {
    // Vercel rewrites might overwrite req.url with /api; restore original path from x-matched-path
    if (req.headers['x-matched-path']) {
      req.url = req.headers['x-matched-path'];
    }
    return app(req, res);
  } catch (err: any) {
    return res.status(500).json({
      error: 'API Serverless Execution Error',
      message: err?.message,
      stack: err?.stack,
    });
  }
}


