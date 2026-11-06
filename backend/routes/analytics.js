const express = require('express');
const Queue = require('../models/Queue');
const requireLogin = require('../middleware/auth');
const router = express.Router();
router.use(requireLogin);

router.get('/', async (req, res) => {
  const days = [1, 7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  const queues = await Queue.find({ manager: req.session.managerId }).lean();
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  const tokens = queues.flatMap((queue) =>
    queue.tokens.map((token) => ({ ...token, queueName: queue.name, queueId: queue._id }))
  );
  const within = (date) => date && new Date(date) >= start && new Date(date) <= now;
  const called = tokens.filter((token) => within(token.startedAt));
  const averageWait = called.length
    ? called.reduce(
        (sum, token) => sum + (new Date(token.startedAt) - new Date(token.joinedAt)),
        0
      ) /
      called.length /
      60000
    : 0;
  const points = days === 1 ? 12 : days;
  const trend = [];
  for (let index = 0; index <= points; index++) {
    const at = new Date(start.getTime() + ((now - start) * index) / points);
    const count = tokens.filter(
      (token) =>
        new Date(token.joinedAt) <= at &&
        (!token.startedAt || new Date(token.startedAt) > at) &&
        (!token.cancelledAt || new Date(token.cancelledAt) > at)
    ).length;
    trend.push({ at, count });
  }
  const recent = [];
  for (const token of tokens) {
    recent.push({
      type: 'joined',
      at: token.joinedAt,
      name: token.name,
      number: token.number,
      queue: token.queueName
    });
    if (token.startedAt)
      recent.push({
        type: 'called',
        at: token.startedAt,
        name: token.name,
        number: token.number,
        queue: token.queueName
      });
    if (token.completedAt)
      recent.push({
        type: 'completed',
        at: token.completedAt,
        name: token.name,
        number: token.number,
        queue: token.queueName
      });
    if (token.cancelledAt)
      recent.push({
        type: 'cancelled',
        at: token.cancelledAt,
        name: token.name,
        number: token.number,
        queue: token.queueName
      });
  }
  recent.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({
    days,
    stats: {
      queues: queues.length,
      waiting: tokens.filter((token) => token.status === 'waiting').length,
      serving: tokens.filter((token) => token.status === 'in_service').length,
      completed: tokens.filter((token) => within(token.completedAt)).length,
      cancelled: tokens.filter((token) => within(token.cancelledAt)).length,
      arrivals: tokens.filter((token) => within(token.joinedAt)).length,
      averageWait: Math.round(averageWait * 10) / 10
    },
    trend,
    recent: recent.slice(0, 8)
  });
});

module.exports = router;
