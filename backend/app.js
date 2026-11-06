const path = require('path');
const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const helmet = require('helmet');

function createApp(mongoUri) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      frameguard: process.env.NODE_ENV === 'production' ? { action: 'sameorigin' } : false,
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'frame-ancestors': process.env.NODE_ENV === 'production' ? ["'self'"] : null,
          'upgrade-insecure-requests': null
        }
      }
    })
  );
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // reject browser requests made by another website
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('sec-fetch-site') === 'cross-site'
    ) {
      return res.status(403).json({ message: 'This request is not allowed.' });
    }
    if (req.method === 'POST' && (!req.body || Array.isArray(req.body))) {
      return res.status(400).json({ message: 'Send a JSON object with your request.' });
    }
    next();
  });
  const store = MongoStore.create({ mongoUrl: mongoUri, ttl: 60 * 60 * 8 });
  app.locals.sessionStore = store;
  app.use(
    session({
      name: 'queueflow.sid',
      secret: process.env.SESSION_SECRET || 'local-demo-secret-change-before-deployment',
      resave: false,
      saveUninitialized: false,
      store,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000
      }
    })
  );
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/queues', require('./routes/queues'));
  app.use('/api/analytics', require('./routes/analytics'));
  app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
  // serve the separate frontend folder from the same origin
  app.use(express.static(path.join(__dirname, '..', 'frontend')));
  app.use((error, req, res, next) => {
    console.error(error.message);
    const status =
      error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500);
    res.status(status).json({
      message: status === 500 ? 'Something went wrong. Please try again.' : error.message
    });
  });
  return app;
}

module.exports = createApp;
