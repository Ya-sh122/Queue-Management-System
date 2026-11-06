const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const startServer = require('../server');
const Queue = require('../models/Queue');
const Manager = require('../models/Manager');
const demo = require('../config/demo');

async function startDemo() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Use npm start with your own MongoDB in production.');
  const dbPath = path.join(__dirname, '..', '.cache', 'demo-mongodb');
  fs.mkdirSync(dbPath, { recursive: true });
  const mongo = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: 'wiredTiger', dbName: 'queueflow' }
  });
  const { app, server } = await startServer(mongo.getUri('queueflow'));
  const manager = demo.isDemoEnabled()
    ? await Manager.findOne({ email: demo.email })
    : null;
  if (manager && !(await Queue.exists({ manager: manager._id }))) {
    const now = Date.now();
    const names = [
      'Olivia Rhye',
      'Phoenix Baker',
      'Lana Steiner',
      'Demi Wilkinson',
      'Drew Cano',
      'Natali Craig'
    ];
    for (const [index, name] of [
      'General enquiries',
      'Customer support',
      'Document collection'
    ].entries()) {
      const tokens = [];
      let number = 1;
      // sample history is included only in the local demo
      for (let day = 6; day >= 0; day--) {
        for (let person = 0; person < 5 + index; person++) {
          const joinedAt = new Date(now - day * 86400000 - (person + 2) * 3600000);
          const startedAt = new Date(joinedAt.getTime() + (4 + person * 2 + index) * 60000);
          tokens.push({
            number: number++,
            name: names[person % names.length],
            status: 'completed',
            position: 0,
            joinedAt,
            startedAt,
            completedAt: new Date(startedAt.getTime() + 7 * 60000)
          });
        }
      }
      tokens.push({
        number: number++,
        name: 'Andi Lane',
        status: 'in_service',
        position: 0,
        joinedAt: new Date(now - 21 * 60000),
        startedAt: new Date(now - 6 * 60000)
      });
      for (let person = 0; person < 4 - index; person++) {
        tokens.push({
          number: number++,
          name: names[person],
          status: 'waiting',
          position: person + 1,
          joinedAt: new Date(now - (15 - person * 3) * 60000)
        });
      }
      await Queue.create({
        name,
        description: [
          'Everyday questions, handled with care.',
          'A little help, right when it matters.',
          'Ready for your next step.'
        ][index],
        manager: manager._id,
        nextNumber: number,
        tokens
      });
    }
  }
  console.log('demo mode: sample queues and local mongodb; not for production');
  async function stop() {
    server.close();
    await app.locals.sessionStore.close();
    await require('mongoose').disconnect();
    await mongo.stop();
    process.exit(0);
  }
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

startDemo().catch((error) => {
  console.error(error);
  process.exit(1);
});
