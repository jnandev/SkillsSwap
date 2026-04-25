const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const isVercel = Boolean(process.env.VERCEL);

module.exports = {
  PORT: Number(process.env.PORT || 4000),
  AUTH_SECRET: process.env.AUTH_SECRET || 'skillsswap-demo-secret',
  TOKEN_TTL_MS: Number(
    process.env.TOKEN_TTL_MS || 1000 * 60 * 60 * 24 * 7
  ),
  DATABASE_PATH:
    process.env.DATABASE_PATH ||
    (isVercel
      ? path.join('/tmp', 'skillsswap.db')
      : path.join(__dirname, 'skillsswap.db')),
  SEED_DATA_FILE: path.join(__dirname, 'data.json'),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
};
