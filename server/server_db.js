import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// Environment Setup 
// Since ES modules are being used, __dirname is not available by default. 
// It is manually reconstructed here so the database file is always saved 
// in the correct absolute path, regardless of where the script is executed from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'lastracing.db'));

// Performance and data integrity features are enabled at the SQLite level.
// WAL (Write-Ahead Logging) improves concurrent read/write performance.
db.pragma('journal_mode = WAL');
// Foreign key constraints are enforced to prevent orphaned data.
db.pragma('foreign_keys = ON');

// Schema Definition 
// The core tables of the application are created here. IF NOT EXISTS is used 
// to ensure the application can restart safely without overwriting existing data.

db.exec(`
  -- Lines represent the different colored metro routes in the network.
  CREATE TABLE IF NOT EXISTS lines (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL
  );

  -- Stations represent the individual physical stops. 
  -- They are kept separate from lines because interchange stations belong to multiple lines.
  CREATE TABLE IF NOT EXISTS stations (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  -- This junction table maps which stations belong to which lines.
  -- The membership of stations on a line is maintained in an ordered manner using 'position'.
  -- Connected segments are formed by adjacent positions (e.g., pos 1 and pos 2) on the same line.
  CREATE TABLE IF NOT EXISTS line_stations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id    INTEGER NOT NULL REFERENCES lines(id),
    station_id INTEGER NOT NULL REFERENCES stations(id),
    position   INTEGER NOT NULL,
    -- A line cannot have two stations at the exact same position.
    UNIQUE(line_id, position),
    -- A station cannot appear twice on the exact same line.
    UNIQUE(line_id, station_id)
  );

  -- Events are the random occurrences that affect the player's coin total.
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT    NOT NULL,
    -- A strict constraint ensures that the effect strictly stays within the exam's -4 to +4 requirement.
    effect      INTEGER NOT NULL CHECK(effect >= -4 AND effect <= 4)
  );

  -- Registered users of the application. 
  -- Plain text passwords are never stored; only the cryptographic hash and unique salt are kept.
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    hash     TEXT NOT NULL,
    salt     TEXT NOT NULL
  );

  -- Games track the player's attempts.
  -- A game currently in progress (during the planning or execution phase) is indicated by score = NULL.
  -- Once the execution phase ends, a completed game is represented by an integer score, 
  -- which is stored permanently for the global ranking board.
  CREATE TABLE IF NOT EXISTS games (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id),
    start_station_id INTEGER NOT NULL REFERENCES stations(id),
    end_station_id   INTEGER NOT NULL REFERENCES stations(id),
    score            INTEGER,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Helpers ───────────────────────────────────────────────────────────────────

// A secure password hashing utility. It generates a random 16-byte salt 
// and uses the scrypt algorithm to compute a strong 64-byte hash.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

// ── Database Initialization (Seed) ────────────────────────────────────────────
// This function is executed only once when the application starts and the database 
// is found to be completely empty.

function seedIfEmpty() {
  // A quick check is performed to see if the lines table has any data. 
  // If it does, the database is already seeded, and the function exits early.
  const count = db.prepare('SELECT COUNT(*) AS c FROM lines').get().c;
  if (count > 0) return;

  // Network: Italian Underground Metro (15 stations, 4 lines) ────────────────
  //
  // The base station names from the exam specification are used across the four lines.
  // Six extra terminal stations (Arco di Pietra, Torrione, Valle Nuova, 
  // Giardino dei Cipressi, Cala Serena, Punta di Sale) are strategically added. 
  // This brings the total to 15 stations and keeps the interchanges at ~46% (7 out of 15). 
  // This mathematically ensures the exam's "interchanges <= 50%" constraint is safely satisfied.
  //
  // RED LINE    : Centrale → Porta Velaria → Crocevia del Falco →
  //               Piazza delle Lanterne → Arco di Pietra → Torrione → Valle Nuova
  // BLUE LINE   : Centrale → Fontana Oscura → Borgo Sereno →
  //               Viale dei Mosaici → Giardino dei Cipressi
  // GREEN LINE  : Porta Velaria → Fontana Oscura → Torre Cinerea →
  //               Campo dell'Eco → Cala Serena
  // YELLOW LINE : Piazza delle Lanterne → Torre Cinerea → Viale dei Mosaici →
  //               Campo dell'Eco → Punta di Sale
  //
  // Interchange stations (7 stations in total, each served by 2 or more lines):
  //   Centrale              — Red + Blue
  //   Porta Velaria         — Red + Green
  //   Fontana Oscura        — Blue + Green
  //   Piazza delle Lanterne — Red + Yellow
  //   Torre Cinerea         — Green + Yellow
  //   Viale dei Mosaici     — Blue + Yellow
  //   Campo dell'Eco        — Green + Yellow

  // Insert the four metro lines
  const insertLine = db.prepare('INSERT INTO lines (name, color) VALUES (?, ?)');
  const l_red    = insertLine.run('Red Line',    '#e63946').lastInsertRowid;
  const l_blue   = insertLine.run('Blue Line',   '#4895ef').lastInsertRowid;
  const l_green  = insertLine.run('Green Line',  '#57cc99').lastInsertRowid;
  const l_yellow = insertLine.run('Yellow Line', '#f4a261').lastInsertRowid;

  // Insert all 15 stations and keep their generated database IDs in a dictionary object 
  // for easy reference when creating the network segments.
  const insertStation = db.prepare('INSERT INTO stations (name) VALUES (?)');
  const s = {
    centrale:            insertStation.run('Centrale').lastInsertRowid,
    portaVelaria:        insertStation.run('Porta Velaria').lastInsertRowid,
    croceviaDelFalco:    insertStation.run('Crocevia del Falco').lastInsertRowid,
    piazzaDelleLanterne: insertStation.run('Piazza delle Lanterne').lastInsertRowid,
    arcoDiPietra:        insertStation.run('Arco di Pietra').lastInsertRowid,
    torrione:            insertStation.run('Torrione').lastInsertRowid,
    valleNuova:          insertStation.run('Valle Nuova').lastInsertRowid,
    fontanaOscura:       insertStation.run('Fontana Oscura').lastInsertRowid,
    borgoSereno:         insertStation.run('Borgo Sereno').lastInsertRowid,
    vialeDeiMosaici:     insertStation.run('Viale dei Mosaici').lastInsertRowid,
    giardinoDeiCipressi: insertStation.run('Giardino dei Cipressi').lastInsertRowid,
    torreCinerea:        insertStation.run('Torre Cinerea').lastInsertRowid,
    campoDellEco:        insertStation.run("Campo dell'Eco").lastInsertRowid,
    calaSerena:          insertStation.run('Cala Serena').lastInsertRowid,
    puntaDiSale:         insertStation.run('Punta di Sale').lastInsertRowid,
  };

  // Map the stations to their respective lines using sequential positioning
  const insertLS = db.prepare(
    'INSERT INTO line_stations (line_id, station_id, position) VALUES (?, ?, ?)'
  );

  // Red Line (7 stations are sequentially inserted to form the full route)
  insertLS.run(l_red, s.centrale,            1);
  insertLS.run(l_red, s.portaVelaria,        2);
  insertLS.run(l_red, s.croceviaDelFalco,    3);
  insertLS.run(l_red, s.piazzaDelleLanterne, 4);
  insertLS.run(l_red, s.arcoDiPietra,        5);
  insertLS.run(l_red, s.torrione,            6);
  insertLS.run(l_red, s.valleNuova,          7);

  // Blue Line (5 stations are sequentially inserted)
  insertLS.run(l_blue, s.centrale,            1);
  insertLS.run(l_blue, s.fontanaOscura,       2);
  insertLS.run(l_blue, s.borgoSereno,         3);
  insertLS.run(l_blue, s.vialeDeiMosaici,     4);
  insertLS.run(l_blue, s.giardinoDeiCipressi, 5);

  // Green Line (5 stations are sequentially inserted)
  insertLS.run(l_green, s.portaVelaria,   1);
  insertLS.run(l_green, s.fontanaOscura,  2);
  insertLS.run(l_green, s.torreCinerea,   3);
  insertLS.run(l_green, s.campoDellEco,   4);
  insertLS.run(l_green, s.calaSerena,     5);

  // Yellow Line (5 stations are sequentially inserted)
  insertLS.run(l_yellow, s.piazzaDelleLanterne, 1);
  insertLS.run(l_yellow, s.torreCinerea,        2);
  insertLS.run(l_yellow, s.vialeDeiMosaici,     3);
  insertLS.run(l_yellow, s.campoDellEco,        4);
  insertLS.run(l_yellow, s.puntaDiSale,         5);

  // Events Configuration
  // 10 specific events are defined with simple descriptions, keeping the coin effects 
  // strictly within the mandated range of -4 to +4.
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

  // User Account Generation
  // The default password "password123" is securely hashed and assigned to all three test users.
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

  // Historic Game Seeding
  // Completed games are pre-seeded for the users 'mario' and 'giulia' to populate the general ranking.
  const insertGame = db.prepare(`
    INSERT INTO games (user_id, start_station_id, end_station_id, score, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // mario : 3 historical completed games are recorded
  insertGame.run(u1, s.centrale,         s.puntaDiSale,         16, '2026-06-01 10:30:00');
  insertGame.run(u1, s.croceviaDelFalco, s.giardinoDeiCipressi, 22, '2026-06-04 14:15:00');
  insertGame.run(u1, s.torrione,         s.campoDellEco,        19, '2026-06-08 09:00:00');

  // giulia : 2 historical completed games are recorded
  insertGame.run(u2, s.centrale,    s.calaSerena,          14, '2026-06-03 16:45:00');
  insertGame.run(u2, s.arcoDiPietra, s.giardinoDeiCipressi, 20, '2026-06-10 11:20:00');
}

// Execute the seed function immediately upon script load.
seedIfEmpty();

export default db;