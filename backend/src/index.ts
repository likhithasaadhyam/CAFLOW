import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import tasksRoutes from './routes/tasks.routes.js';
import todosRoutes from './routes/todos.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import renewalsRoutes from './routes/renewals.routes.js';
import documentsRoutes from './routes/documents.routes.js';
import financeRoutes from './routes/finance.routes.js';
import timesheetsRoutes from './routes/timesheets.routes.js';
import servicesRoutes from './routes/services.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import voiceRoutes from './routes/voice.routes.js';
import clientPortalRoutes from './routes/clientPortal.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*', // Allows local vite frontend
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'CAFlow Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Domain Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/todos', todosRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/renewals', renewalsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/timesheets', timesheetsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/client-portal', clientPortalRoutes);

// Centralized error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 CAFlow Backend Server running on port ${PORT}`);
});

export default app;
