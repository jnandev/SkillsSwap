const { MONGODB_URI } = require('./config');

module.exports = MONGODB_URI
  ? require('./db-mongo')
  : require('./db-libsql');
