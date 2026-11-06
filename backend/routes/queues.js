const express = require('express');
const mongoose = require('mongoose');
const Queue = require('../models/Queue');
const requireLogin = require('../middleware/auth');
const router = express.Router();
router.use(requireLogin);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function cleanText(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    fail(`${label} is required and must be ${max} characters or fewer.`);
  }
  return value.trim();
}

function waitingTokens(queue) {
  return queue.tokens
    .filter((token) => token.status === 'waiting')
    .sort((a, b) => a.position - b.position);
}

function fixPositions(queue) {
  waitingTokens(queue).forEach((token, index) => {
    token.position = index + 1;
  });
}

// retry when another request has changed the same queue
async function updateQueue(req, change) {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Queue not found.', 404);
  for (let attempt = 0; attempt < 8; attempt++) {
    const queue = await Queue.findOne({ _id: req.params.id, manager: req.session.managerId });
    if (!queue) fail('Queue not found.', 404);
    change(queue);
    try {
      await queue.save();
      return queue;
    } catch (error) {
      if (error.name !== 'VersionError') throw error;
    }
  }
  fail('This queue is busy. Refresh and try again.', 409);
}

router.get('/', async (req, res) => {
  const queues = await Queue.find({ manager: req.session.managerId }).sort({ createdAt: 1 });
  res.json({
    queues: queues.map((queue) => ({
      _id: queue.id,
      name: queue.name,
      description: queue.description,
      waiting: queue.tokens.filter((t) => t.status === 'waiting').length,
      serving: queue.tokens.find((t) => t.status === 'in_service') || null,
      completed: queue.tokens.filter((t) => t.status === 'completed').length,
      createdAt: queue.createdAt
    }))
  });
});

router.post('/', async (req, res) => {
  const name = cleanText(req.body.name, 'Queue name', 60);
  const description =
    req.body.description === undefined || req.body.description === ''
      ? ''
      : cleanText(req.body.description, 'Description', 160);
  const queue = await Queue.create({ manager: req.session.managerId, name, description });
  res.status(201).json({ queue });
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Queue not found.', 404);
  const queue = await Queue.findOne({ _id: req.params.id, manager: req.session.managerId });
  if (!queue) fail('Queue not found.', 404);
  res.json({ queue });
});

router.post('/:id/tokens', async (req, res) => {
  const name = cleanText(req.body.name, 'Person name', 80);
  const queue = await updateQueue(req, (queue) => {
    // keep the document small enough for a simple embedded data model
    if (queue.tokens.length >= 5000)
      fail('This queue has reached its 5,000-token limit. Please create a new queue.');
    queue.tokens.push({
      name,
      number: queue.nextNumber,
      position: waitingTokens(queue).length + 1
    });
    queue.nextNumber += 1;
  });
  res.status(201).json({ queue });
});

router.post('/:id/next', async (req, res) => {
  const expectedTokenId = req.body.tokenId;
  const queue = await updateQueue(req, (queue) => {
    if (queue.tokens.some((token) => token.status === 'in_service'))
      fail('Complete the current service before calling the next person.', 409);
    const next = waitingTokens(queue)[0];
    if (!next) fail('There are no people waiting.', 409);
    if (String(next._id) !== expectedTokenId)
      fail('The queue order changed. Please review it and try again.', 409);
    next.status = 'in_service';
    next.startedAt = new Date();
    fixPositions(queue);
  });
  res.json({ queue });
});

router.post('/:id/tokens/:tokenId/:action', async (req, res) => {
  const { tokenId, action } = req.params;
  if (!['move', 'cancel', 'complete'].includes(action)) fail('Action not found.', 404);
  const queue = await updateQueue(req, (queue) => {
    const token = queue.tokens.id(tokenId);
    if (!token) fail('Token not found.', 404);
    if (action === 'complete') {
      if (token.status !== 'in_service') fail('This token is not in service.', 409);
      token.status = 'completed';
      token.completedAt = new Date();
    } else {
      if (token.status !== 'waiting') fail('Only waiting tokens can be moved or cancelled.', 409);
      if (action === 'cancel') {
        token.status = 'cancelled';
        token.cancelledAt = new Date();
        fixPositions(queue);
      } else {
        if (!['up', 'down'].includes(req.body.direction)) fail('Choose up or down.');
        const waiting = waitingTokens(queue);
        const index = waiting.findIndex((item) => item.id === token.id);
        const other = waiting[index + (req.body.direction === 'up' ? -1 : 1)];
        if (!other) fail('This token cannot move any further.', 409);
        const position = token.position;
        token.position = other.position;
        other.position = position;
      }
    }
  });
  res.json({ queue });
});

module.exports = router;
