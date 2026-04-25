const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const {
  DATABASE_PATH,
  SEED_DATA_FILE,
} = require('./config');

const seed = JSON.parse(fs.readFileSync(SEED_DATA_FILE, 'utf8'));
const db = new DatabaseSync(DATABASE_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const runMigrations = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      headline TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      skills_offered TEXT NOT NULL DEFAULT '[]',
      skills_to_learn TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS discovery_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      persona TEXT NOT NULL,
      title TEXT NOT NULL,
      skill TEXT NOT NULL,
      category TEXT NOT NULL,
      country TEXT NOT NULL,
      rating REAL NOT NULL,
      bio TEXT NOT NULL,
      next_session_slots TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS user_card_state (
      user_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      connected INTEGER NOT NULL DEFAULT 0,
      favorited INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, card_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (card_id) REFERENCES discovery_cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      with_name TEXT NOT NULL,
      skill TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      calendar_url TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      base_participants INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_event_state (
      user_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (user_id, event_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learning_plans (
      user_id TEXT PRIMARY KEY,
      profile_completed INTEGER NOT NULL DEFAULT 0,
      first_session_booked INTEGER NOT NULL DEFAULT 0,
      challenge_joined INTEGER NOT NULL DEFAULT 0,
      skills_target INTEGER NOT NULL DEFAULT 4,
      skills_completed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      user_id TEXT PRIMARY KEY,
      unread_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      participant TEXT NOT NULL,
      topic TEXT NOT NULL,
      unread INTEGER NOT NULL DEFAULT 0,
      last_message TEXT NOT NULL,
      last_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
};

const parseList = (value) => {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
};

const boolInt = (value) => (value ? 1 : 0);
const nowIso = () => new Date().toISOString();
const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const sanitizeUserRow = (row) => {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    headline: row.headline,
    bio: row.bio,
    country: row.country,
    skillsOffered: parseList(row.skills_offered),
    skillsToLearn: parseList(row.skills_to_learn),
    createdAt: row.created_at,
  };
};

const rowToCard = (row) => ({
  id: row.id,
  name: row.name,
  persona: row.persona,
  title: row.title,
  skill: row.skill,
  category: row.category,
  country: row.country,
  rating: Number(row.rating),
  bio: row.bio,
  nextSessionSlots: parseList(row.next_session_slots),
  connected: Boolean(row.connected),
  favorited: Boolean(row.favorited),
});

const rowToSession = (row) => ({
  id: row.id,
  cardId: row.card_id,
  with: row.with_name,
  skill: row.skill,
  time: row.time,
  status: row.status,
  createdAt: row.created_at,
  calendarUrl: row.calendar_url,
});

const rowToEvent = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  participants: Number(row.participants),
  joined: Boolean(row.joined),
});

const rowToLearningPlan = (row) => ({
  profileCompleted: Boolean(row.profile_completed),
  firstSessionBooked: Boolean(row.first_session_booked),
  challengeJoined: Boolean(row.challenge_joined),
  skillsTarget: Number(row.skills_target),
  skillsCompleted: Number(row.skills_completed),
});

const rowToNotification = (row) => ({
  id: row.id,
  title: row.title,
  detail: row.detail,
  createdAt: row.created_at,
  read: Boolean(row.read),
});

const rowToThread = (row) => ({
  id: row.id,
  participant: row.participant,
  topic: row.topic,
  unread: Number(row.unread),
  lastMessage: row.last_message,
  lastAt: row.last_at,
});

const profileCompleted = (user) =>
  Boolean(
    user.headline &&
      user.bio &&
      user.country &&
      user.skillsOffered.length &&
      user.skillsToLearn.length
  );

const ensureUserState = (userId, overrides = {}) => {
  db.prepare(
    `INSERT OR IGNORE INTO learning_plans (
      user_id, profile_completed, first_session_booked, challenge_joined, skills_target, skills_completed
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    boolInt(overrides.profileCompleted),
    boolInt(overrides.firstSessionBooked),
    boolInt(overrides.challengeJoined),
    overrides.skillsTarget ?? 4,
    overrides.skillsCompleted ?? 0
  );

  db.prepare(
    'INSERT OR IGNORE INTO messages (user_id, unread_count) VALUES (?, ?)'
  ).run(userId, overrides.unreadCount ?? 0);
};

const pushNotification = (userId, title, detail) => {
  db.prepare(
    `INSERT INTO notifications (id, user_id, title, detail, created_at, read)
     VALUES (?, ?, ?, ?, ?, 0)`
  ).run(newId('n'), userId, title, detail, nowIso());
};

const seedDatabase = () => {
  const hasUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (hasUsers > 0) {
    return;
  }

  const insertCategory = db.prepare(
    'INSERT INTO categories (name) VALUES (?)'
  );
  seed.categories.forEach((name) => insertCategory.run(name));

  const insertCard = db.prepare(
    `INSERT INTO discovery_cards (
      id, name, persona, title, skill, category, country, rating, bio, next_session_slots
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  seed.discoveryCards.forEach((card) => {
    insertCard.run(
      card.id,
      card.name,
      card.persona,
      card.title,
      card.skill,
      card.category,
      card.country,
      card.rating,
      card.bio,
      JSON.stringify(card.nextSessionSlots)
    );
  });

  const insertEvent = db.prepare(
    'INSERT INTO events (id, title, description, base_participants) VALUES (?, ?, ?, ?)'
  );
  seed.events.forEach((event) => {
    insertEvent.run(
      event.id,
      event.title,
      event.description,
      Math.max(event.participants - (event.joined ? 1 : 0), 0)
    );
  });

  const demoUser = seed.users[0];
  const demoUserId = demoUser.id;
  db.prepare(
    `INSERT INTO users (
      id, name, email, password_hash, headline, bio, country, skills_offered, skills_to_learn, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    demoUser.id,
    demoUser.name,
    demoUser.email.toLowerCase(),
    bcrypt.hashSync(demoUser.password, 10),
    demoUser.headline,
    demoUser.bio,
    demoUser.country,
    JSON.stringify(demoUser.skillsOffered),
    JSON.stringify(demoUser.skillsToLearn),
    nowIso()
  );

  ensureUserState(demoUserId, {
    profileCompleted: seed.learningPlan.profileCompleted,
    firstSessionBooked: seed.learningPlan.firstSessionBooked,
    challengeJoined: seed.learningPlan.challengeJoined,
    skillsTarget: seed.learningPlan.skillsTarget,
    skillsCompleted: seed.learningPlan.skillsCompleted,
    unreadCount: seed.messages.unreadCount,
  });

  const upsertCardState = db.prepare(
    `INSERT INTO user_card_state (user_id, card_id, connected, favorited)
     VALUES (?, ?, ?, ?)`
  );
  seed.discoveryCards.forEach((card) => {
    if (card.connected || card.favorited) {
      upsertCardState.run(
        demoUserId,
        card.id,
        boolInt(card.connected),
        boolInt(card.favorited)
      );
    }
  });

  const insertSession = db.prepare(
    `INSERT INTO sessions (
      id, user_id, card_id, with_name, skill, time, status, created_at, calendar_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  seed.sessions.forEach((session) => {
    insertSession.run(
      session.id,
      demoUserId,
      session.cardId,
      session.with,
      session.skill,
      session.time,
      session.status,
      session.createdAt,
      session.calendarUrl
    );
  });

  const insertEventJoin = db.prepare(
    'INSERT OR IGNORE INTO user_event_state (user_id, event_id, joined_at) VALUES (?, ?, ?)'
  );
  seed.events
    .filter((event) => event.joined)
    .forEach((event) => insertEventJoin.run(demoUserId, event.id, nowIso()));

  const insertNotification = db.prepare(
    `INSERT INTO notifications (id, user_id, title, detail, created_at, read)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  seed.notifications.forEach((notification) => {
    insertNotification.run(
      notification.id,
      demoUserId,
      notification.title,
      notification.detail,
      notification.createdAt,
      boolInt(notification.read)
    );
  });

  const insertThread = db.prepare(
    `INSERT INTO message_threads (id, user_id, participant, topic, unread, last_message, last_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  seed.messageThreads.forEach((thread) => {
    insertThread.run(
      thread.id,
      demoUserId,
      thread.participant,
      thread.topic,
      thread.unread,
      thread.lastMessage,
      thread.lastAt
    );
  });
};

runMigrations();
seedDatabase();

const createUser = ({ name, email, password }) => {
  const id = newId('user');
  const normalizedEmail = String(email).toLowerCase().trim();
  const passwordHash = bcrypt.hashSync(String(password), 10);

  db.prepare(
    `INSERT INTO users (
      id, name, email, password_hash, headline, bio, country, skills_offered, skills_to_learn, created_at
    ) VALUES (?, ?, ?, ?, '', '', '', '[]', '[]', ?)`
  ).run(id, String(name).trim(), normalizedEmail, passwordHash, nowIso());

  ensureUserState(id);
  return getUserById(id);
};

const getUserByEmail = (email) =>
  db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());

const getUserById = (userId) =>
  sanitizeUserRow(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));

const verifyPassword = (userRow, password) =>
  Boolean(userRow && bcrypt.compareSync(String(password), userRow.password_hash));

const updateProfile = (userId, updates) => {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!current) {
    return null;
  }

  const next = {
    name: updates.name ?? current.name,
    headline: updates.headline ?? current.headline,
    bio: updates.bio ?? current.bio,
    country: updates.country ?? current.country,
    skillsOffered: updates.skillsOffered ?? parseList(current.skills_offered),
    skillsToLearn: updates.skillsToLearn ?? parseList(current.skills_to_learn),
  };

  db.prepare(
    `UPDATE users
     SET name = ?, headline = ?, bio = ?, country = ?, skills_offered = ?, skills_to_learn = ?
     WHERE id = ?`
  ).run(
    next.name,
    next.headline,
    next.bio,
    next.country,
    JSON.stringify(next.skillsOffered),
    JSON.stringify(next.skillsToLearn),
    userId
  );

  db.prepare(
    'UPDATE learning_plans SET profile_completed = ? WHERE user_id = ?'
  ).run(boolInt(profileCompleted(next)), userId);

  return getUserById(userId);
};

const getPublicOverview = () => {
  const mentorCount = db
    .prepare("SELECT COUNT(*) AS count FROM discovery_cards WHERE persona = 'teacher'")
    .get().count;
  const learnerCount = db
    .prepare("SELECT COUNT(*) AS count FROM discovery_cards WHERE persona = 'learner'")
    .get().count;
  const featuredCards = db
    .prepare(
      `SELECT id, name, persona, title, skill, category, country, rating, bio, next_session_slots,
              0 AS connected, 0 AS favorited
       FROM discovery_cards
       ORDER BY rating DESC
       LIMIT 4`
    )
    .all()
    .map(rowToCard);
  const featuredEvents = db
    .prepare(
      `SELECT id, title, description, base_participants AS participants, 0 AS joined
       FROM events
       ORDER BY base_participants DESC
       LIMIT 3`
    )
    .all();

  return {
    totalMembers:
      db.prepare('SELECT COUNT(*) AS count FROM users').get().count +
      db.prepare('SELECT COUNT(*) AS count FROM discovery_cards').get().count,
    mentorCount,
    learnerCount,
    sessionCount: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
    categories: db.prepare('SELECT name FROM categories ORDER BY name').all().map((row) => row.name),
    featuredCards,
    featuredEvents,
  };
};

const getCategories = () =>
  db.prepare('SELECT name FROM categories ORDER BY name').all().map((row) => row.name);

const getDiscoveryCards = (userId, { q = '', category = 'All', persona = 'All' }) => {
  const query = String(q).toLowerCase().trim();
  return db
    .prepare(
      `SELECT c.*,
              COALESCE(s.connected, 0) AS connected,
              COALESCE(s.favorited, 0) AS favorited
       FROM discovery_cards c
       LEFT JOIN user_card_state s
         ON s.card_id = c.id AND s.user_id = ?
       WHERE (? = '' OR lower(c.name) LIKE ? OR lower(c.skill) LIKE ? OR lower(c.title) LIKE ?)
         AND (? = 'All' OR c.category = ?)
         AND (? = 'All' OR c.persona = ?)
       ORDER BY c.rating DESC, c.name ASC`
    )
    .all(
      userId,
      query,
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
      category,
      category,
      persona,
      persona
    )
    .map(rowToCard);
};

const upsertCardState = (userId, cardId, next) => {
  db.prepare(
    `INSERT INTO user_card_state (user_id, card_id, connected, favorited)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, card_id)
     DO UPDATE SET connected = excluded.connected, favorited = excluded.favorited`
  ).run(userId, cardId, boolInt(next.connected), boolInt(next.favorited));
};

const getCardForUser = (userId, cardId) =>
  db
    .prepare(
      `SELECT c.*,
              COALESCE(s.connected, 0) AS connected,
              COALESCE(s.favorited, 0) AS favorited
       FROM discovery_cards c
       LEFT JOIN user_card_state s
         ON s.card_id = c.id AND s.user_id = ?
       WHERE c.id = ?`
    )
    .get(userId, cardId);

const incrementUnreadMessages = (userId, amount = 1) => {
  db.prepare(
    'UPDATE messages SET unread_count = unread_count + ? WHERE user_id = ?'
  ).run(amount, userId);
};

const toggleConnect = (userId, cardId) => {
  const current = getCardForUser(userId, cardId);
  if (!current) {
    return null;
  }
  const nextConnected = !Boolean(current.connected);
  upsertCardState(userId, cardId, {
    connected: nextConnected,
    favorited: Boolean(current.favorited),
  });
  if (nextConnected) {
    incrementUnreadMessages(userId, 1);
    pushNotification(
      userId,
      'New connection',
      `You connected with ${current.name} for ${current.skill}.`
    );
  }
  return rowToCard(getCardForUser(userId, cardId));
};

const toggleFavorite = (userId, cardId) => {
  const current = getCardForUser(userId, cardId);
  if (!current) {
    return null;
  }
  const nextFavorited = !Boolean(current.favorited);
  upsertCardState(userId, cardId, {
    connected: Boolean(current.connected),
    favorited: nextFavorited,
  });
  if (nextFavorited) {
    pushNotification(
      userId,
      'Saved profile',
      `${current.name} was added to your favorites list.`
    );
  }
  return rowToCard(getCardForUser(userId, cardId));
};

const getSessions = (userId) =>
  db
    .prepare(
      `SELECT * FROM sessions
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC`
    )
    .all(userId)
    .map(rowToSession);

const bookSession = (userId, cardId, time) => {
  const card = db.prepare('SELECT * FROM discovery_cards WHERE id = ?').get(cardId);
  if (!card) {
    return null;
  }
  const id = newId('session');
  const createdAt = nowIso();
  const calendarUrl = `/api/sessions/${id}/calendar`;

  db.prepare(
    `INSERT INTO sessions (
      id, user_id, card_id, with_name, skill, time, status, created_at, calendar_url
    ) VALUES (?, ?, ?, ?, ?, ?, 'upcoming', ?, ?)`
  ).run(id, userId, card.id, card.name, card.skill, time, createdAt, calendarUrl);

  db.prepare(
    `UPDATE learning_plans
     SET first_session_booked = 1
     WHERE user_id = ?`
  ).run(userId);

  incrementUnreadMessages(userId, 1);
  pushNotification(userId, 'Booking confirmed', `${card.name} session is booked for ${time}.`);
  return rowToSession(db.prepare('SELECT * FROM sessions WHERE id = ?').get(id));
};

const updateSessionStatus = (userId, sessionId, status) => {
  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId);
  if (!session) {
    return null;
  }
  db.prepare(
    'UPDATE sessions SET status = ? WHERE id = ? AND user_id = ?'
  ).run(status, sessionId, userId);
  pushNotification(
    userId,
    'Session status updated',
    `${session.skill} with ${session.with_name} is now ${status}.`
  );
  return rowToSession(
    db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, userId)
  );
};

const getSessionById = (userId, sessionId) =>
  db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);

const getEvents = (userId) =>
  db
    .prepare(
      `SELECT e.id, e.title, e.description,
              e.base_participants + COUNT(ues.user_id) AS participants,
              MAX(CASE WHEN ues.user_id = ? THEN 1 ELSE 0 END) AS joined
       FROM events e
       LEFT JOIN user_event_state ues ON ues.event_id = e.id
       GROUP BY e.id
       ORDER BY participants DESC, e.title ASC`
    )
    .all(userId)
    .map(rowToEvent);

const joinEvent = (userId, eventId) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return null;
  }
  const existing = db
    .prepare('SELECT 1 FROM user_event_state WHERE user_id = ? AND event_id = ?')
    .get(userId, eventId);
  if (!existing) {
    db.prepare(
      'INSERT INTO user_event_state (user_id, event_id, joined_at) VALUES (?, ?, ?)'
    ).run(userId, eventId, nowIso());
    db.prepare(
      'UPDATE learning_plans SET challenge_joined = 1 WHERE user_id = ?'
    ).run(userId);
    incrementUnreadMessages(userId, 1);
    pushNotification(userId, 'Event joined', `You joined "${event.title}".`);
  }
  return getEvents(userId).find((item) => item.id === eventId) || null;
};

const getLearningPlan = (userId) =>
  rowToLearningPlan(
    db.prepare('SELECT * FROM learning_plans WHERE user_id = ?').get(userId)
  );

const updateLearningPlan = (userId, updates) => {
  const current = getLearningPlan(userId);
  if (!current) {
    return null;
  }
  const next = {
    profileCompleted: updates.profileCompleted ?? current.profileCompleted,
    firstSessionBooked: updates.firstSessionBooked ?? current.firstSessionBooked,
    challengeJoined: updates.challengeJoined ?? current.challengeJoined,
    skillsTarget: updates.skillsTarget ?? current.skillsTarget,
    skillsCompleted: updates.skillsCompleted ?? current.skillsCompleted,
  };
  db.prepare(
    `UPDATE learning_plans
     SET profile_completed = ?, first_session_booked = ?, challenge_joined = ?, skills_target = ?, skills_completed = ?
     WHERE user_id = ?`
  ).run(
    boolInt(next.profileCompleted),
    boolInt(next.firstSessionBooked),
    boolInt(next.challengeJoined),
    next.skillsTarget,
    next.skillsCompleted,
    userId
  );
  return getLearningPlan(userId);
};

const getMessages = (userId) =>
  db.prepare('SELECT unread_count FROM messages WHERE user_id = ?').get(userId) || {
    unread_count: 0,
  };

const markMessagesRead = (userId) => {
  db.prepare('UPDATE messages SET unread_count = 0 WHERE user_id = ?').run(userId);
  db.prepare('UPDATE message_threads SET unread = 0 WHERE user_id = ?').run(userId);
  return { unreadCount: 0 };
};

const getNotifications = (userId) =>
  db
    .prepare(
      `SELECT * FROM notifications
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC`
    )
    .all(userId)
    .map(rowToNotification);

const markNotificationsRead = (userId) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId);
  return getNotifications(userId);
};

const getMessageThreads = (userId) =>
  db
    .prepare(
      `SELECT * FROM message_threads
       WHERE user_id = ?
       ORDER BY datetime(last_at) DESC`
    )
    .all(userId)
    .map(rowToThread);

const replyThread = (userId, threadId, message) => {
  const thread = db
    .prepare('SELECT * FROM message_threads WHERE id = ? AND user_id = ?')
    .get(threadId, userId);
  if (!thread) {
    return null;
  }
  db.prepare(
    `UPDATE message_threads
     SET last_message = ?, last_at = ?, unread = 0
     WHERE id = ? AND user_id = ?`
  ).run(String(message).trim(), nowIso(), threadId, userId);
  pushNotification(userId, 'Message sent', `Your reply was sent to ${thread.participant}.`);
  return rowToThread(
    db.prepare('SELECT * FROM message_threads WHERE id = ? AND user_id = ?').get(threadId, userId)
  );
};

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  updateProfile,
  getPublicOverview,
  getCategories,
  getDiscoveryCards,
  toggleConnect,
  toggleFavorite,
  getSessions,
  bookSession,
  updateSessionStatus,
  getSessionById,
  getEvents,
  joinEvent,
  getLearningPlan,
  updateLearningPlan,
  getMessages,
  markMessagesRead,
  getNotifications,
  markNotificationsRead,
  getMessageThreads,
  replyThread,
};
