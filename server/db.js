import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// Because ES modules are used, __dirname is not available by default.
// It is reconstructed here so that the database file is always resolved to the correct
// absolute path regardless of the working directory from which the script is run.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'lastracing.db'));

// WAL journal mode is enabled to improve concurrent read and write performance.
db.pragma('journal_mode = WAL');
// Foreign key constraints are enforced to prevent orphaned records.
db.pragma('foreign_keys = ON');

// The core tables are created with IF NOT EXISTS so the application can be restarted
// safely without overwriting existing data.

db.exec(`
  -- The coloured metro routes in the network are stored here.
  CREATE TABLE IF NOT EXISTS lines (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL
  );

  -- Individual physical stops are kept separate from lines because
  -- interchange stations belong to more than one line.
  CREATE TABLE IF NOT EXISTS stations (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  -- This junction table records which stations belong to which lines.
  -- Order is preserved with position, and adjacent positions on the same line form a segment.
  CREATE TABLE IF NOT EXISTS line_stations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id    INTEGER NOT NULL REFERENCES lines(id),
    station_id INTEGER NOT NULL REFERENCES stations(id),
    position   INTEGER NOT NULL,
    -- Two stations cannot occupy the same position on the same line.
    UNIQUE(line_id, position),
    -- A station cannot appear more than once on the same line.
    UNIQUE(line_id, station_id)
  );

  -- Random events that affect the player's coin total are stored here.
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT    NOT NULL,
    -- The effect is constrained to the range of -4 to +4 as required by the specification.
    effect      INTEGER NOT NULL CHECK(effect >= -4 AND effect <= 4)
  );

  -- Registered users of the application; plain-text passwords are never stored.
  -- Only the cryptographic hash and its unique salt are kept.
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    hash     TEXT NOT NULL,
    salt     TEXT NOT NULL
  );

  -- Each row represents one game attempt by a player.
  -- A null score indicates the game is still in progress; an integer score means it is completed
  -- and eligible to appear on the global ranking.
  CREATE TABLE IF NOT EXISTS games (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id),
    start_station_id INTEGER NOT NULL REFERENCES stations(id),
    end_station_id   INTEGER NOT NULL REFERENCES stations(id),
    score            INTEGER,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Helpers

// A random 16-byte salt is generated and the scrypt algorithm is used to produce a 64-byte hash.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

// Database seed
// This function is executed once at startup; if the database is not empty, it returns immediately.

function seedIfEmpty() {
  // The lines table is checked; if data is already present the function exits early.
  const count = db.prepare('SELECT COUNT(*) AS c FROM lines').get().c;
  if (count > 0) return;

  // The fictional Italian underground network consists of 12 stations across 4 lines,
  // with 4 interchange stations, each served by exactly 2 lines (33% of total, within the 50% limit).
  //
  // Red Line    : Centrale, Porta Velaria, Crocevia del Falco, Piazza delle Lanterne
  // Blue Line   : Centrale, Fontana Oscura, Borgo Sereno, Viale dei Mosaici
  // Green Line  : Fontana Oscura, Torre Cinerea, Campo dell'Eco, Cala Serena
  // Yellow Line : Viale dei Mosaici, Torre Cinerea, Giardino dei Cipressi, Punta di Sale
  //
  // Interchange stations:
  //   Centrale          (Red + Blue)
  //   Fontana Oscura    (Blue + Green)
  //   Torre Cinerea     (Green + Yellow)
  //   Viale dei Mosaici (Blue + Yellow)

  // The four metro lines are inserted.
  const insertLine = db.prepare('INSERT INTO lines (name, color) VALUES (?, ?)');
  const l_red    = insertLine.run('Red Line',    '#e63946').lastInsertRowid;
  const l_blue   = insertLine.run('Blue Line',   '#4895ef').lastInsertRowid;
  const l_green  = insertLine.run('Green Line',  '#57cc99').lastInsertRowid;
  const l_yellow = insertLine.run('Yellow Line', '#f4a261').lastInsertRowid;

  // All twelve stations are inserted and their generated IDs are stored for use when
  // the network segments are created.
  const insertStation = db.prepare('INSERT INTO stations (name) VALUES (?)');
  const s = {
    centrale:            insertStation.run('Centrale').lastInsertRowid,
    portaVelaria:        insertStation.run('Porta Velaria').lastInsertRowid,
    croceviaDelFalco:    insertStation.run('Crocevia del Falco').lastInsertRowid,
    piazzaDelleLanterne: insertStation.run('Piazza delle Lanterne').lastInsertRowid,
    fontanaOscura:       insertStation.run('Fontana Oscura').lastInsertRowid,
    borgoSereno:         insertStation.run('Borgo Sereno').lastInsertRowid,
    vialeDeiMosaici:     insertStation.run('Viale dei Mosaici').lastInsertRowid,
    giardinoDeiCipressi: insertStation.run('Giardino dei Cipressi').lastInsertRowid,
    torreCinerea:        insertStation.run('Torre Cinerea').lastInsertRowid,
    campoDellEco:        insertStation.run("Campo dell'Eco").lastInsertRowid,
    calaSerena:          insertStation.run('Cala Serena').lastInsertRowid,
    puntaDiSale:         insertStation.run('Punta di Sale').lastInsertRowid,
  };

  // Stations are mapped to their respective lines using sequential position values.
  const insertLS = db.prepare(
    'INSERT INTO line_stations (line_id, station_id, position) VALUES (?, ?, ?)'
  );

  // Red Line: Centrale → Porta Velaria → Crocevia del Falco → Piazza delle Lanterne
  insertLS.run(l_red, s.centrale,            1);
  insertLS.run(l_red, s.portaVelaria,        2);
  insertLS.run(l_red, s.croceviaDelFalco,    3);
  insertLS.run(l_red, s.piazzaDelleLanterne, 4);

  // Blue Line: Centrale → Fontana Oscura → Borgo Sereno → Viale dei Mosaici
  insertLS.run(l_blue, s.centrale,        1);
  insertLS.run(l_blue, s.fontanaOscura,   2);
  insertLS.run(l_blue, s.borgoSereno,     3);
  insertLS.run(l_blue, s.vialeDeiMosaici, 4);

  // Green Line: Fontana Oscura → Torre Cinerea → Campo dell'Eco → Cala Serena
  insertLS.run(l_green, s.fontanaOscura, 1);
  insertLS.run(l_green, s.torreCinerea,  2);
  insertLS.run(l_green, s.campoDellEco,  3);
  insertLS.run(l_green, s.calaSerena,    4);

  // Yellow Line: Viale dei Mosaici → Torre Cinerea → Giardino dei Cipressi → Punta di Sale
  insertLS.run(l_yellow, s.vialeDeiMosaici,     1);
  insertLS.run(l_yellow, s.torreCinerea,        2);
  insertLS.run(l_yellow, s.giardinoDeiCipressi, 3);
  insertLS.run(l_yellow, s.puntaDiSale,         4);

  // Ten events are defined with concise descriptions; all coin effects are kept
  // within the required range of -4 to +4.
  const insertEvent = db.prepare(
    'INSERT INTO events (description, effect) VALUES (?, ?)'
  );
  insertEvent.run('Quiet journey, 0 coins',            0);
  insertEvent.run('Wrong platform, -2 coins',         -2);
  insertEvent.run('Kind passenger, +1 coin',          +1);
  insertEvent.run('Broken train, -4 coins',           -4);
  insertEvent.run('Fast connection, +3 coins',        +3);
  insertEvent.run('Signal failure, -3 coins',         -3);
  insertEvent.run('Helpful staff, +2 coins',          +2);
  insertEvent.run('Crowded carriage, -1 coin',        -1);
  insertEvent.run('Missed stop, -1 coin',             -1);
  insertEvent.run('Lucky day, +4 coins',              +4);

  // Three test users are created; the password "password123" is hashed and salted for each.
  const insertUser = db.prepare(
    'INSERT INTO users (username, hash, salt) VALUES (?, ?, ?)'
  );
  const creds = {
    mario:   hashPassword('password123'),
    giulia:  hashPassword('password123'),
    lorenzo: hashPassword('password123'),
  };
  const u1 = insertUser.run('mario',   creds.mario.hash,   creds.mario.salt).lastInsertRowid;
  const u2 = insertUser.run('giulia',  creds.giulia.hash,  creds.giulia.salt).lastInsertRowid;
  insertUser.run('lorenzo', creds.lorenzo.hash, creds.lorenzo.salt);

  // Completed historical games are pre-seeded for mario and giulia to populate the general ranking.
  const insertGame = db.prepare(`
    INSERT INTO games (user_id, start_station_id, end_station_id, score, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Three completed games are recorded for mario.
  insertGame.run(u1, s.centrale,         s.puntaDiSale,         16, '2026-06-01 10:30:00');
  insertGame.run(u1, s.croceviaDelFalco, s.giardinoDeiCipressi, 22, '2026-06-04 14:15:00');
  insertGame.run(u1, s.borgoSereno,      s.calaSerena,          19, '2026-06-08 09:00:00');

  // Two completed games are recorded for giulia.
  insertGame.run(u2, s.centrale,            s.calaSerena,          14, '2026-06-03 16:45:00');
  insertGame.run(u2, s.piazzaDelleLanterne, s.giardinoDeiCipressi, 20, '2026-06-10 11:20:00');
}

// The seed function is executed immediately when the module is loaded.
seedIfEmpty();

export default db;