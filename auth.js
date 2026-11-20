const crypto = require('crypto');
const db = require('./db').getDb();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions = db.sessions || [];
  db.sessions.push({ token, userId: user.id, username: user.username, createdAt: new Date().toISOString() });
  require('./db').save(db);
  return token;
}

function destroySession(token) {
  db.sessions = (db.sessions || []).filter((s) => s.token !== token);
  require('./db').save(db);
}

function getSessionUser(token) {
  const s = (db.sessions || []).find((x) => x.token === token);
  if (!s) return null;
  const user = (db.users || []).find((u) => u.id === s.userId);
  return user || null;
}

module.exports = { createSession, destroySession, getSessionUser };
