const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const Manager = require('../models/Manager');
const requireLogin = require('../middleware/auth');
const demo = require('../config/demo');
const router = express.Router();

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' }
});

const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Please try again in an hour.' }
});

// create a fresh session after signing in or creating an account
function startSession(req, res, manager, status = 200) {
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ message: 'Could not start your session.' });
    req.session.managerId = manager.id;
    req.session.isDemo = manager.email === demo.email;
    req.session.save((saveError) => {
      if (saveError) return res.status(500).json({ message: 'Could not save your session.' });
      res.status(status).json({ manager: { name: manager.name, email: manager.email } });
    });
  });
}

router.get('/demo', (req, res) => {
  if (!demo.isDemoEnabled()) return res.json({ enabled: false });
  res.json({ enabled: true, email: demo.email, password: demo.password });
});

router.post('/register', registerLimit, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirmPassword = req.body.confirmPassword;

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ message: 'Enter a name between 2 and 80 characters.' });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res
      .status(400)
      .json({ message: 'Use at least 8 characters and no more than 72 bytes for your password.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'The passwords do not match.' });
  }
  if (email === demo.email) {
    return res
      .status(409)
      .json({ message: 'This email is reserved for the demo account. Use another email.' });
  }

  try {
    const manager = await Manager.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12)
    });
    startSession(req, res, manager, 201);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ message: 'An account with this email already exists. Please sign in.' });
    }
    throw error;
  }
});

router.post('/login', loginLimit, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password || email.length > 254 || password.length > 200) {
    return res.status(400).json({ message: 'Enter a valid email and password.' });
  }
  if (email === demo.email && !demo.isDemoEnabled()) {
    return res.status(401).json({ message: 'The email or password is incorrect.' });
  }
  const manager = await Manager.findOne({ email });
  if (!manager || !(await bcrypt.compare(password, manager.passwordHash))) {
    return res.status(401).json({ message: 'The email or password is incorrect.' });
  }
  startSession(req, res, manager);
});

router.get('/me', requireLogin, async (req, res) => {
  const manager = await Manager.findById(req.session.managerId).select('name email');
  if (!manager) return res.status(401).json({ message: 'Please log in again.' });
  res.json({ manager });
});

router.post('/logout', requireLogin, (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ message: 'Could not log out. Please retry.' });
    res.clearCookie('queueflow.sid');
    res.json({ message: 'Logged out.' });
  });
});

module.exports = router;
