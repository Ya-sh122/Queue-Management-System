const demo = require('../config/demo');

function requireLogin(req, res, next) {
  if (!req.session.managerId) {
    return res.status(401).json({ message: 'Please log in to continue.' });
  }
  if (req.session.isDemo && !demo.isDemoEnabled()) {
    return req.session.destroy(() => {
      res.clearCookie('queueflow.sid');
      res
        .status(401)
        .json({ message: 'Demo access is disabled. Please sign in with your own account.' });
    });
  }
  next();
}

module.exports = requireLogin;
