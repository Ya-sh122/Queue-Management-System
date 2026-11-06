function isDemoEnabled() {
  if (process.env.ENABLE_DEMO === 'true') return true;
  if (process.env.ENABLE_DEMO === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

module.exports = {
  isDemoEnabled,
  email: 'demo@queue.com',
  password: 'Demo@123'
};
