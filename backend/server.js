const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const SEED_DATA_FILE = path.join(__dirname, 'data.json');
const DATA_FILE = process.env.VERCEL
  ? path.join('/tmp', 'skillsswap-data.json')
  : SEED_DATA_FILE;
const AUTH_SECRET = process.env.AUTH_SECRET || 'skillsswap-demo-secret';

app.use(cors());
app.use(express.json());

const ensureDataFile = () => {
  if (fs.existsSync(DATA_FILE)) {
    return;
  }
  fs.copyFileSync(SEED_DATA_FILE, DATA_FILE);
};

const readData = () => {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
};

const writeData = (nextData) => {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(nextData, null, 2));
};

const pushNotification = (data, title, detail) => {
  data.notifications.unshift({
    id: `n-${Date.now()}`,
    title,
    detail,
    createdAt: new Date().toISOString(),
    read: false,
  });
};

const formatDateForICS = (isoString) =>
  new Date(isoString).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

const sign = (value) =>
  crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('hex');

const createToken = (userId) => {
  const payload = Buffer.from(JSON.stringify({ userId }), 'utf8').toString(
    'base64url'
  );
  return `${payload}.${sign(payload)}`;
};

const readToken = (token) => {
  const [payload = '', signature = ''] = String(token).split('.');
  if (!payload || !signature) {
    return null;
  }
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof parsed.userId === 'string' ? parsed.userId : null;
  } catch {
    return null;
  }
};

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }
  const { password, ...safeUser } = user;
  return safeUser;
};

const profileCompleted = (user) => {
  return Boolean(
    user.headline &&
      user.bio &&
      user.country &&
      Array.isArray(user.skillsOffered) &&
      user.skillsOffered.length > 0 &&
      Array.isArray(user.skillsToLearn) &&
      user.skillsToLearn.length > 0
  );
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
  const data = readData();
  const mentorCount = data.discoveryCards.filter(
    (card) => card.persona === 'teacher'
  ).length;
  const learnerCount = data.discoveryCards.filter(
    (card) => card.persona === 'learner'
  ).length;
  const featuredCards = [...data.discoveryCards]
    .sort((left, right) => right.rating - left.rating)
    .slice(0, 4);
  const featuredEvents = data.events.slice(0, 3);

  res.json({
    totalMembers: data.users.length + data.discoveryCards.length,
    mentorCount,
    learnerCount,
    sessionCount: data.sessions.length,
    categories: data.categories,
    featuredCards,
    featuredEvents,
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: 'name, email, and password are required' });
  }
  const normalizedEmail = String(email).toLowerCase().trim();
  const data = readData();
  const exists = data.users.find((user) => user.email === normalizedEmail);
  if (exists) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const user = {
    id: `user-${Date.now()}`,
    name: String(name).trim(),
    email: normalizedEmail,
    password: String(password),
    headline: '',
    bio: '',
    country: '',
    skillsOffered: [],
    skillsToLearn: [],
  };
  data.users.push(user);
  writeData(data);
  const token = createToken(user.id);
  return res.json({ token, user: sanitizeUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const normalizedEmail = String(email).toLowerCase().trim();
  const data = readData();
  const user = data.users.find(
    (item) => item.email === normalizedEmail && item.password === password
  );
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = createToken(user.id);
  return res.json({ token, user: sanitizeUser(user) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const data = readData();
  const user = data.users.find((item) => item.id === req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json({ user: sanitizeUser(user) });
});

app.get('/api/profile', authRequired, (req, res) => {
  const data = readData();
  const user = data.users.find((item) => item.id === req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(sanitizeUser(user));
});

app.patch('/api/profile', authRequired, (req, res) => {
  const data = readData();
  const user = data.users.find((item) => item.id === req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const allowed = new Set([
    'name',
    'headline',
    'bio',
    'country',
    'skillsOffered',
    'skillsToLearn',
  ]);
  Object.entries(req.body).forEach(([key, value]) => {
    if (allowed.has(key)) {
      user[key] = value;
    }
  });
  data.learningPlan.profileCompleted = profileCompleted(user);
  writeData(data);
  return res.json(sanitizeUser(user));
});

app.get('/api/categories', authRequired, (_, res) => {
  const data = readData();
  res.json(data.categories);
});

app.get('/api/discovery', authRequired, (req, res) => {
  const { q = '', category = 'All', persona = 'All' } = req.query;
  const data = readData();
  const query = String(q).toLowerCase().trim();

  const cards = data.discoveryCards.filter((card) => {
    const queryMatches =
      !query ||
      card.name.toLowerCase().includes(query) ||
      card.skill.toLowerCase().includes(query) ||
      card.title.toLowerCase().includes(query);
    const categoryMatches = category === 'All' || card.category === category;
    const personaMatches = persona === 'All' || card.persona === persona;
    return queryMatches && categoryMatches && personaMatches;
  });

  res.json(cards);
});

app.post('/api/discovery/:id/connect', authRequired, (req, res) => {
  const data = readData();
  const card = data.discoveryCards.find((item) => item.id === req.params.id);
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }
  card.connected = !card.connected;
  if (card.connected) {
    data.messages.unreadCount += 1;
    pushNotification(
      data,
      'New connection',
      `You connected with ${card.name} for ${card.skill}.`
    );
  }
  writeData(data);
  return res.json(card);
});

app.post('/api/discovery/:id/favorite', authRequired, (req, res) => {
  const data = readData();
  const card = data.discoveryCards.find((item) => item.id === req.params.id);
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }
  card.favorited = !card.favorited;
  if (card.favorited) {
    pushNotification(
      data,
      'Saved profile',
      `${card.name} was added to your favorites list.`
    );
  }
  writeData(data);
  return res.json(card);
});

app.get('/api/sessions', authRequired, (_, res) => {
  const data = readData();
  res.json(data.sessions);
});

app.post('/api/sessions/book', authRequired, (req, res) => {
  const { cardId, time } = req.body;
  if (!cardId || !time) {
    return res.status(400).json({ error: 'cardId and time are required' });
  }
  const data = readData();
  const card = data.discoveryCards.find((item) => item.id === cardId);
  if (!card) {
    return res.status(404).json({ error: 'Discovery card not found' });
  }
  const booking = {
    id: `session-${Date.now()}`,
    cardId: card.id,
    with: card.name,
    skill: card.skill,
    time,
    status: 'upcoming',
    createdAt: new Date().toISOString(),
    calendarUrl: `/api/sessions/session-${Date.now()}/calendar`,
  };
  booking.calendarUrl = `/api/sessions/${booking.id}/calendar`;
  data.sessions.unshift(booking);
  data.learningPlan.firstSessionBooked = true;
  data.messages.unreadCount += 1;
  pushNotification(
    data,
    'Booking confirmed',
    `${card.name} session is booked for ${time}.`
  );
  writeData(data);
  return res.json(booking);
});

app.patch('/api/sessions/:id/status', authRequired, (req, res) => {
  const { status } = req.body;
  const allowed = new Set(['upcoming', 'live', 'completed']);
  if (!allowed.has(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const data = readData();
  const session = data.sessions.find((item) => item.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  session.status = status;
  pushNotification(
    data,
    'Session status updated',
    `${session.skill} with ${session.with} is now ${status}.`
  );
  writeData(data);
  return res.json(session);
});

app.get('/api/sessions/:id/calendar', authRequired, (req, res) => {
  const data = readData();
  const session = data.sessions.find((item) => item.id === req.params.id);
  if (!session) {
    return res.status(404).send('Session not found');
  }
  const startAt = new Date(session.createdAt).toISOString();
  const endAt = new Date(
    new Date(session.createdAt).getTime() + 45 * 60 * 1000
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
    `DESCRIPTION:Session with ${session.with}`,
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

app.get('/api/events', authRequired, (_, res) => {
  const data = readData();
  res.json(data.events);
});

app.post('/api/events/:id/join', authRequired, (req, res) => {
  const data = readData();
  const event = data.events.find((item) => item.id === req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  if (!event.joined) {
    event.joined = true;
    event.participants += 1;
    data.learningPlan.challengeJoined = true;
    data.messages.unreadCount += 1;
    pushNotification(data, 'Event joined', `You joined "${event.title}".`);
  }
  writeData(data);
  return res.json(event);
});

app.get('/api/learning-plan', authRequired, (_, res) => {
  const data = readData();
  res.json(data.learningPlan);
});

app.patch('/api/learning-plan', authRequired, (req, res) => {
  const allowed = new Set([
    'profileCompleted',
    'firstSessionBooked',
    'challengeJoined',
    'skillsTarget',
    'skillsCompleted',
  ]);
  const data = readData();

  Object.entries(req.body).forEach(([key, value]) => {
    if (allowed.has(key)) {
      data.learningPlan[key] = value;
    }
  });

  writeData(data);
  res.json(data.learningPlan);
});

app.get('/api/messages', authRequired, (_, res) => {
  const data = readData();
  res.json(data.messages);
});

app.post('/api/messages/read', authRequired, (_, res) => {
  const data = readData();
  data.messages.unreadCount = 0;
  data.messageThreads = data.messageThreads.map((thread) => ({
    ...thread,
    unread: 0,
  }));
  writeData(data);
  res.json(data.messages);
});

app.get('/api/notifications', authRequired, (_, res) => {
  const data = readData();
  res.json(data.notifications);
});

app.post('/api/notifications/read', authRequired, (_, res) => {
  const data = readData();
  data.notifications = data.notifications.map((item) => ({ ...item, read: true }));
  writeData(data);
  res.json(data.notifications);
});

app.get('/api/messages/threads', authRequired, (_, res) => {
  const data = readData();
  res.json(data.messageThreads);
});

app.post('/api/messages/threads/:id/reply', authRequired, (req, res) => {
  const { message } = req.body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const data = readData();
  const thread = data.messageThreads.find((item) => item.id === req.params.id);
  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }
  thread.lastMessage = String(message).trim();
  thread.lastAt = new Date().toISOString();
  thread.unread = 0;
  pushNotification(
    data,
    'Message sent',
    `Your reply was sent to ${thread.participant}.`
  );
  writeData(data);
  return res.json(thread);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SkillSwap backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
