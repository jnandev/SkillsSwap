const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const {
  PORT,
  AUTH_SECRET,
  TOKEN_TTL_MS,
  CORS_ORIGIN,
} = require('./config');
const db = require('./db');

const app = express();

app.use(
  cors({
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  })
);
app.use(express.json());

const formatDateForICS = (isoString) =>
  new Date(isoString).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

const sign = (value) =>
  crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('hex');

const createToken = (userId) => {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Date.now() + TOKEN_TTL_MS,
    }),
    'utf8'
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

const readToken = (token) => {
  const [payload = '', signature = ''] = String(token).split('.');
  if (!payload || !signature) {
    return null;
  }
  const expected = sign(payload);
  if (expected !== signature) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return parsed.userId;
  } catch {
    return null;
  }
};

const authRequired = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '')
    : '';
  const queryToken =
    typeof req.query.token === 'string' ? req.query.token : '';
  const token = bearerToken || queryToken;
  const userId = token ? readToken(token) : null;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = userId;
  return next();
};

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.get('/api/public-overview', (_, res) => {
  res.json(db.getPublicOverview());
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: 'name, email, and password are required' });
  }
  const existing = db.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const user = db.createUser({ name, email, password });
  return res.json({ token: createToken(user.id), user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const userRow = db.getUserByEmail(email);
  if (!db.verifyPassword(userRow, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const user = db.getUserById(userRow.id);
  return res.json({ token: createToken(user.id), user });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.getUserById(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json({ user });
});

app.get('/api/profile', authRequired, (req, res) => {
  const user = db.getUserById(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(user);
});

app.patch('/api/profile', authRequired, (req, res) => {
  const nextUser = db.updateProfile(req.userId, req.body || {});
  if (!nextUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(nextUser);
});

app.get('/api/categories', authRequired, (_, res) => {
  res.json(db.getCategories());
});

app.get('/api/discovery', authRequired, (req, res) => {
  const { q = '', category = 'All', persona = 'All' } = req.query;
  res.json(
    db.getDiscoveryCards(req.userId, {
      q,
      category,
      persona,
    })
  );
});

app.post('/api/discovery/:id/connect', authRequired, (req, res) => {
  const card = db.toggleConnect(req.userId, req.params.id);
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }
  return res.json(card);
});

app.post('/api/discovery/:id/favorite', authRequired, (req, res) => {
  const card = db.toggleFavorite(req.userId, req.params.id);
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }
  return res.json(card);
});

app.get('/api/sessions', authRequired, (req, res) => {
  res.json(db.getSessions(req.userId));
});

app.post('/api/sessions/book', authRequired, (req, res) => {
  const { cardId, time } = req.body;
  if (!cardId || !time) {
    return res.status(400).json({ error: 'cardId and time are required' });
  }
  const booking = db.bookSession(req.userId, cardId, time);
  if (!booking) {
    return res.status(404).json({ error: 'Discovery card not found' });
  }
  return res.json(booking);
});

app.patch('/api/sessions/:id/status', authRequired, (req, res) => {
  const { status } = req.body;
  const allowed = new Set(['upcoming', 'live', 'completed']);
  if (!allowed.has(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const session = db.updateSessionStatus(req.userId, req.params.id, status);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  return res.json(session);
});

app.get('/api/sessions/:id/calendar', authRequired, (req, res) => {
  const session = db.getSessionById(req.userId, req.params.id);
  if (!session) {
    return res.status(404).send('Session not found');
  }
  const startAt = new Date(session.created_at).toISOString();
  const endAt = new Date(
    new Date(session.created_at).getTime() + 45 * 60 * 1000
  ).toISOString();
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SkillSwap//Session Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${session.id}@skillsswap.app`,
    `DTSTAMP:${formatDateForICS(new Date().toISOString())}`,
    `DTSTART:${formatDateForICS(startAt)}`,
    `DTEND:${formatDateForICS(endAt)}`,
    `SUMMARY:SkillSwap - ${session.skill}`,
    `DESCRIPTION:Session with ${session.with_name}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${session.id}.ics"`
  );
  return res.send(ics);
});

app.get('/api/events', authRequired, (req, res) => {
  res.json(db.getEvents(req.userId));
});

app.post('/api/events/:id/join', authRequired, (req, res) => {
  const event = db.joinEvent(req.userId, req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  return res.json(event);
});

app.get('/api/learning-plan', authRequired, (req, res) => {
  res.json(db.getLearningPlan(req.userId));
});

app.patch('/api/learning-plan', authRequired, (req, res) => {
  const plan = db.updateLearningPlan(req.userId, req.body || {});
  if (!plan) {
    return res.status(404).json({ error: 'Learning plan not found' });
  }
  return res.json(plan);
});

app.get('/api/messages', authRequired, (req, res) => {
  const messages = db.getMessages(req.userId);
  res.json({ unreadCount: Number(messages.unread_count || 0) });
});

app.post('/api/messages/read', authRequired, (req, res) => {
  res.json(db.markMessagesRead(req.userId));
});

app.get('/api/notifications', authRequired, (req, res) => {
  res.json(db.getNotifications(req.userId));
});

app.post('/api/notifications/read', authRequired, (req, res) => {
  res.json(db.markNotificationsRead(req.userId));
});

app.get('/api/messages/threads', authRequired, (req, res) => {
  res.json(db.getMessageThreads(req.userId));
});

app.post('/api/messages/threads/:id/reply', authRequired, (req, res) => {
  const { message } = req.body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const thread = db.replyThread(req.userId, req.params.id, message);
  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }
  return res.json(thread);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SkillSwap backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
