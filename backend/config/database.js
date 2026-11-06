const mongoose = require('mongoose');

async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('mongodb connected');
}

module.exports = connectDatabase;
