const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const connectDatabase = require('./config/database');
const createApp = require('./app');
const seedManager = require('./scripts/seed');

async function startServer(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('Set MONGODB_URI in .env, or run npm run demo.');
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
      throw new Error('Set a session secret of at least 32 characters.');
  }
  await connectDatabase(uri);
  await seedManager();
  const app = createApp(uri);
  const port = process.env.PORT || 3000;
  const server = app.listen(port, '0.0.0.0', () =>
    console.log(`queueflow is running on port ${port}`)
  );
  return { app, server };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = startServer;
