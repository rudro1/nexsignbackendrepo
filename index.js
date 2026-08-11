'use strict';

require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');

const app = express();
app.set('trust proxy', 1);

// ═══════════════════════════════════════════════════════════════
// CLOUDINARY — সবার আগে configure করতে হবে
// এটা না থাকলে templateController load হওয়ার সময় crash করে
// এটাই ছিল /api/templates 404 এর মূল কারণ
// ═══════════════════════════════════════════════════════════════
try {
  const { v2: cloudinary } = require('cloudinary');
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
  });
  console.log('✅ Cloudinary configured');
} catch (e) {
  console.error('❌ Cloudinary config failed:', e.message);
}

// ═══════════════════════════════════════════════════════════════
// ALLOWED ORIGINS
// ═══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://nexsignfrontend.vercel.app',
  'https://nexsign-front.vercel.app',
  'https://nexsign-front-rudro1.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://localhost:4173',
];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  return false;
};

// ═══════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════
const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked: ${origin}`);
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization',
    'X-Requested-With', 'Accept',
    'X-CSRF-Token', 'X-Api-Version',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge:         86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ═══════════════════════════════════════════════════════════════
// HELMET — সাবধানে configure করতে হবে
// frameguard বন্ধ করতে হবে — নইলে PDF iframe block হয়
// এটাই ছিল "X-Frame-Options: sameorigin" এর কারণ
// ═══════════════════════════════════════════════════════════════
app.use(
  helmet({
    // ✅ frameguard বন্ধ — PDF proxy iframe কাজ করবে
    frameguard:                false,
    // ✅ বাকিগুলো আগের মতো
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy:     false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy:   false,
  }),
);

// ═══════════════════════════════════════════════════════════════
// CUSTOM HEADERS
// ═══════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader(
      'Access-Control-Allow-Origin',
      origin || 'https://nexsignfrontend.vercel.app',
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,X-Requested-With,Accept,X-CSRF-Token',
    );
  }

  res.setHeader('Cross-Origin-Opener-Policy',   'unsafe-none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');

  // ✅ X-Frame-Options সরিয়ে দিচ্ছি
  // PDF proxy route এ iframe কাজ করার জন্য
  res.removeHeader('X-Frame-Options');

  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ═══════════════════════════════════════════════════════════════
// BODY PARSERS
// ═══════════════════════════════════════════════════════════════
app.use(express.json({       limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO — Vercel serverless এ কাজ করে না
// ═══════════════════════════════════════════════════════════════
app.set('io', null);
app.all('/socket.io*', (_req, res) => {
  res.status(200).json({ success: true, message: 'Serverless mode.' });
});

// ═══════════════════════════════════════════════════════════════
// MONGODB — singleton connection
// ═══════════════════════════════════════════════════════════════
let isConnecting  = false;
let connectPromise = null;

async function connectDB() {
  // Already connected
  if (mongoose.connection.readyState === 1) return;

  // Connection in progress — wait for it
  if (connectPromise) {
    await connectPromise;
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI environment variable is missing!');
  }

  connectPromise = mongoose
    .connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS:          45_000,
      maxPoolSize:              10,
    })
    .then(() => {
      console.log('✅ MongoDB connected');
      connectPromise = null;
    })
    .catch((err) => {
      console.error('❌ MongoDB connection failed:', err.message);
      connectPromise = null;
      throw err;
    });

  await connectPromise;
}

// DB connection middleware — runs before every request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('💥 DB connection error:', err.message);
    return res.status(503).json({
      success: false,
      code:    'DB_UNAVAILABLE',
      message: 'Database temporarily unavailable. Please try again.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════
app.get('/api/health', (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    success:  true,
    status:   'ok',
    db:       states[mongoose.connection.readyState] || 'unknown',
    env:      process.env.NODE_ENV || 'development',
    ts:       new Date().toISOString(),
    version:  process.env.npm_package_version || '1.0.0',
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ── Auth ──────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));

// ── Documents (Module 1 — Sequential Signing) ─────────────────
app.use('/api/documents', require('./routes/documentRoutes'));

// ── Module 1 — Field Coordinates API ────────────────────────────
// Mounted as /api/documents/:id/fields (nested under documents)
try {
  const fieldRoutes = require('./routes/fieldRoutes');
  app.use('/api/documents/:id/fields', fieldRoutes);
  console.log('✅ fieldRoutes (Module 1) loaded');
} catch (err) {
  console.error('❌ fieldRoutes failed:', err.message);
}

// ── Templates (Module 2 — One-to-Many) ───────────────────────
// ✅ Safe load — crash এর কারণ log হবে, server down হবে না
try {
  const templateRoutes = require('./routes/templateRoutes');
  app.use('/api/templates', templateRoutes);
  console.log('✅ templateRoutes loaded successfully');
  const campaignRoutes = require('./routes/campaignRoutes');
  app.use('/api/template-campaigns', campaignRoutes);
  console.log('✅ campaignRoutes loaded successfully');
} catch (err) {
  console.error('❌ templateRoutes failed to load:', err.message);
  console.error(err.stack);
  // Route crash হলে 503 দেবে, পুরো server down হবে না
  app.use('/api/templates', (_req, res) => {
    res.status(503).json({
      success: false,
      code:    'TEMPLATE_SERVICE_ERROR',
      message: 'Template service is temporarily unavailable.',
      // Production এ stack দেখাবে না
      ...(process.env.NODE_ENV !== 'production' && {
        error: err.message,
        stack: err.stack,
      }),
    });
  });
}

// ── Template Field CRUD (Module 1) ────────────────────────────
// Mounted as /api/templates/:id/fields (nested under templates)
try {
  const templateFieldRoutes = require('./routes/templateFieldRoutes');
  app.use('/api/templates/:id/fields', templateFieldRoutes);
  console.log('✅ templateFieldRoutes (Module 1) loaded');
} catch (err) {
  console.error('❌ templateFieldRoutes failed:', err.message);
}

// ── Admin ─────────────────────────────────────────────────────
try {
  app.use('/api/admin', require('./routes/adminRoutes'));
} catch (err) {
  console.error('❌ adminRoutes failed:', err.message);
}

// ── Feedback ──────────────────────────────────────────────────
try {
  app.use('/api/feedback', require('./routes/feedbackRoutes'));
} catch (err) {
  console.error('❌ feedbackRoutes failed:', err.message);
}

// ═══════════════════════════════════════════════════════════════
// 404 HANDLER
// ═══════════════════════════════════════════════════════════════
app.use((req, res) => {
  console.warn(`⚠️  404: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    code:    'NOT_FOUND',
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

// ═══════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ═══════════════════════════════════════════════════════════════
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;

  console.error(`💥 [${req.method} ${req.path}] ${status}:`, err.message);

  // CORS error
  if (err.message?.startsWith('CORS blocked')) {
    return res.status(403).json({
      success: false,
      code:    'CORS_BLOCKED',
      message: err.message,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      code:    'VALIDATION_ERROR',
      message: messages.join(', '),
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      code:    'DUPLICATE_KEY',
      message: `${field} already exists.`,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      code:    'INVALID_TOKEN',
      message: 'Invalid token.',
    });
  }

  // Generic error
  res.status(status).json({
    success: false,
    code:    'SERVER_ERROR',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ═══════════════════════════════════════════════════════════════
// LOCAL DEV SERVER
// Production এ Vercel নিজেই handle করে
// ═══════════════════════════════════════════════════════════════
if (process.env.NODE_ENV !== 'production') {
  const http       = require('http');
  const { Server } = require('socket.io');
  const server     = http.createServer(app);

  const io = new Server(server, {
    cors:       corsOptions,
    transports: ['polling', 'websocket'],
  });

  app.set('io', io);

  io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id);

    socket.on('join:user',     (id) => socket.join(`user_${id}`));
    socket.on('join:document', (id) => socket.join(`doc:${id}`));
    socket.on('join:owner',    (id) => socket.join(`owner:${id}`));

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected:', socket.id);
    });
  });

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Server running: http://localhost:${PORT}`);
    console.log(`📋 Health check:   http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;