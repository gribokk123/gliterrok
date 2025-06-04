const sqlite3 = require("sqlite3").verbose()
const path = require("path")

class Database {
  constructor() {
    this.db = null
    this.dbPath = process.env.NODE_ENV === "production" ? "/tmp/mafia_game.db" : path.join(__dirname, "mafia_game.db")
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error("Ошибка подключения к базе данных:", err)
          reject(err)
        } else {
          console.log("✅ Подключение к SQLite базе данных установлено")
          this.createTables().then(resolve).catch(reject)
        }
      })
    })
  }

  async createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT UNIQUE NOT NULL,
        avatar TEXT,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        creator_nickname TEXT NOT NULL,
        min_players INTEGER NOT NULL,
        max_players INTEGER NOT NULL,
        roles TEXT NOT NULL,
        status TEXT DEFAULT 'waiting',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        players TEXT NOT NULL,
        roles_distribution TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        winner TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME
      )`,

      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    ]

    for (const query of queries) {
      await this.runQuery(query)
    }
  }

  runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve({ id: this.lastID, changes: this.changes })
        }
      })
    })
  }

  getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err)
        } else {
          resolve(row)
        }
      })
    })
  }

  allQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  }

  // Методы для пользователей
  async createUser(userData) {
    const { nickname, avatar = null } = userData

    try {
      await this.runQuery("INSERT INTO users (nickname, avatar) VALUES (?, ?)", [nickname, avatar])

      return this.getUser(nickname)
    } catch (error) {
      if (error.message.includes("UNIQUE constraint failed")) {
        throw new Error("Пользователь с таким никнеймом уже существует")
      }
      throw error
    }
  }

  async getUser(nickname) {
    return this.getQuery("SELECT * FROM users WHERE nickname = ?", [nickname])
  }

  async userExists(nickname) {
    const user = await this.getUser(nickname)
    return !!user
  }

  async updateUserStats(nickname, won = false) {
    await this.runQuery(
      "UPDATE users SET games_played = games_played + 1, games_won = games_won + ? WHERE nickname = ?",
      [won ? 1 : 0, nickname],
    )
  }

  // Методы для комнат
  async createRoom(roomData) {
    const { id, name, creator, minPlayers, maxPlayers, roles } = roomData

    await this.runQuery(
      "INSERT INTO rooms (id, name, creator_nickname, min_players, max_players, roles) VALUES (?, ?, ?, ?, ?, ?)",
      [id, name, creator.nickname, minPlayers, maxPlayers, JSON.stringify(roles)],
    )
  }

  async getRooms() {
    const rooms = await this.allQuery('SELECT * FROM rooms WHERE status = "waiting" ORDER BY created_at DESC')

    return rooms.map((room) => ({
      ...room,
      roles: JSON.parse(room.roles),
    }))
  }

  async deleteRoom(roomId) {
    await this.runQuery("DELETE FROM rooms WHERE id = ?", [roomId])
  }

  // Методы для игр
  async startGame(roomId, gameData) {
    const gameId = "game_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)

    await this.runQuery("INSERT INTO games (id, room_id, players, roles_distribution) VALUES (?, ?, ?, ?)", [
      gameId,
      roomId,
      JSON.stringify(gameData.players),
      JSON.stringify(gameData.roles),
    ])

    // Обновляем статус комнаты
    await this.runQuery('UPDATE rooms SET status = "playing" WHERE id = ?', [roomId])

    return gameId
  }

  async endGame(gameId, winner) {
    await this.runQuery('UPDATE games SET status = "finished", winner = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?', [
      winner,
      gameId,
    ])
  }

  // Методы для сообщений
  async saveMessage(messageData) {
    const { roomId, sender, message, timestamp } = messageData

    await this.runQuery("INSERT INTO messages (room_id, sender, message, timestamp) VALUES (?, ?, ?, ?)", [
      roomId,
      sender,
      message,
      timestamp,
    ])
  }

  async getRoomMessages(roomId, limit = 50) {
    return this.allQuery("SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?", [roomId, limit])
  }

  // Статистика
  async getStats() {
    const totalUsers = await this.getQuery("SELECT COUNT(*) as count FROM users")
    const totalGames = await this.getQuery("SELECT COUNT(*) as count FROM games")
    const activeRooms = await this.getQuery('SELECT COUNT(*) as count FROM rooms WHERE status = "waiting"')

    return {
      totalUsers: totalUsers.count,
      totalGames: totalGames.count,
      activeRooms: activeRooms.count,
    }
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error("Ошибка закрытия базы данных:", err)
          } else {
            console.log("✅ База данных закрыта")
          }
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

module.exports = Database
