const bcrypt = require('bcryptjs');
const Manager = require('../models/Manager');
const demo = require('../config/demo');

async function seedManager() {
  await Manager.init();
  if (!demo.isDemoEnabled()) return null;

  let manager = await Manager.findOne({ email: demo.email });
  if (!manager) {
    manager = await Manager.create({
      name: 'Demo Manager',
      email: demo.email,
      passwordHash: await bcrypt.hash(demo.password, 12)
    });
    console.log('demo manager created');
  } else if (!(await bcrypt.compare(demo.password, manager.passwordHash))) {
    throw new Error(
      'The demo email already has a different password. Disable the demo or use a separate assessment database.'
    );
  }
  return manager;
}

module.exports = seedManager;
