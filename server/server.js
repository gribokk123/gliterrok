const express = require("express")
const http = require("http")
const WebSocket = require("ws")
const cors = require("cors")
const path = require("path")
const fs = require("fs")

const Database = require("./database")
const WebSocketHandler = require("./websocket-handler")
const GameEngine = require("./game-engine")

class MafiaGameServer {
  constructor() {
    this.app = express()
    this.server = http.createServer(this.app)
    this.wss = new WebSocket.Server({ server: this.server })

    this.db = new Database()
    this.gameEngine = new GameEngine()
    this.wsHandler = new WebSocketHandler(this.wss, this.db, this.gameEngine)

    this.setupMiddleware()
    this.setupRoutes()
    this.setupErrorHandling()

    this.port = process.env.PORT || 3000
  }

  setupMiddleware() {
    // CORS
    this.app.use(
      cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    )

    // JSON парсер
    this.app.use(express.json({ limit: "10mb" }))
    this.app.use(express.urlencoded({ extended: true }))

    // Статические файлы
    this.app.use("/static", express.static(path.join(__dirname, "public")))

    // Логирование
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
      next()
    })
  }

  setupRoutes() {
    // API маршруты
    this.app.use("/api", this.createApiRoutes())

    // Главная страница
    this.app.get("/", (req, res) => {
      res.json({
        name: "Mafia Game Server",
        version: "1.0.0",
        status: "running",
        uptime: process.uptime(),
        stats: {
          ...this.wsHandler.getStats(),
          ...this.gameEngine.getGameStats(),
        },
      })
    })

    // Веб-интерфейс для мониторинга
    this.app.get("/admin", (req, res) => {
      res.send(this.generateAdminPage())
    })
  }

  createApiRoutes() {
    const router = express.Router()

    // Проверка уникальности никнейма
    router.post("/check-nickname", async (req, res) => {
      try {
        const { nickname } = req.body

        if (!nickname) {
          return res.status(400).json({ error: "Никнейм не указан" })
        }

        const exists = await this.db.userExists(nickname)
        res.json({ isUnique: !exists })
      } catch (error) {
        console.error("Ошибка проверки никнейма:", error)
        res.status(500).json({ error: "Внутренняя ошибка сервера" })
      }
    })

    // Создание пользователя
    router.post("/users", async (req, res) => {
      try {
        const userData = req.body

        // Валидация
        if (!userData.nickname || userData.nickname.length < 3) {
          return res.status(400).json({ error: "Некорректный никнейм" })
        }

        const user = await this.db.createUser(userData)
        res.status(201).json(user)
      } catch (error) {
        console.error("Ошибка создания пользователя:", error)
        res.status(500).json({ error: "Ошибка создания пользователя" })
      }
    })

    // Получение пользователя
    router.get("/users/:nickname", async (req, res) => {
      try {
        const { nickname } = req.params
        const user = await this.db.getUser(nickname)

        if (!user) {
          return res.status(404).json({ error: "Пользователь не найден" })
        }

        res.json(user)
      } catch (error) {
        console.error("Ошибка получения пользователя:", error)
        res.status(500).json({ error: "Внутренняя ошибка сервера" })
      }
    })

    // Получение списка комнат
    router.get("/rooms", async (req, res) => {
      try {
        const rooms = await this.db.getRooms()
        res.json(rooms)
      } catch (error) {
        console.error("Ошибка получения комнат:", error)
        res.status(500).json({ error: "Ошибка получения комнат" })
      }
    })

    // Статистика сервера
    router.get("/stats", (req, res) => {
      res.json({
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
        },
        websocket: this.wsHandler.getStats(),
        game: this.gameEngine.getGameStats(),
      })
    })

    // Здоровье сервера
    router.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      })
    })

    return router
  }

  setupErrorHandling() {
    // 404 обработчик
    this.app.use((req, res) => {
      res.status(404).json({
        error: "Маршрут не найден",
        path: req.path,
        method: req.method,
      })
    })

    // Глобальный обработчик ошибок
    this.app.use((error, req, res, next) => {
      console.error("Необработанная ошибка:", error)
      res.status(500).json({
        error: "Внутренняя ошибка сервера",
        message: process.env.NODE_ENV === "development" ? error.message : undefined,
      })
    })
  }

  generateAdminPage() {
    const stats = {
      ...this.wsHandler.getStats(),
      ...this.gameEngine.getGameStats(),
    }

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Mafia Game Server - Admin</title>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
                .container { max-width: 1200px; margin: 0 auto; }
                .card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
                .stat { text-align: center; padding: 20px; background: #667eea; color: white; border-radius: 8px; }
                .stat-value { font-size: 2em; font-weight: bold; }
                .stat-label { font-size: 0.9em; opacity: 0.9; }
                h1 { color: #333; text-align: center; }
                h2 { color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
                .refresh { background: #27ae60; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎭 Mafia Game Server</h1>
                
                <div class="card">
                    <h2>📊 Статистика</h2>
                    <div class="stats">
                        <div class="stat">
                            <div class="stat-value">${stats.connectedUsers || 0}</div>
                            <div class="stat-label">Подключенных пользователей</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value">${stats.activeRooms || 0}</div>
                            <div class="stat-label">Активных комнат</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value">${stats.activeGames || 0}</div>
                            <div class="stat-label">Активных игр</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value">${Math.round(process.uptime() / 60)}</div>
                            <div class="stat-label">Минут работы</div>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <h2>🔧 Управление</h2>
                    <button class="refresh" onclick="location.reload()">Обновить</button>
                    <button class="refresh" onclick="fetch('/api/stats').then(r=>r.json()).then(console.log)">Получить статистику</button>
                </div>
                
                <div class="card">
                    <h2>📝 Логи</h2>
                    <div id="logs" style="background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: monospace; max-height: 300px; overflow-y: auto;">
                        Логи загружаются...
                    </div>
                </div>
            </div>
            
            <script>
                // Автообновление каждые 30 секунд
                setInterval(() => {
                    location.reload();
                }, 30000);
                
                // Загрузка логов (заглушка)
                document.getElementById('logs').innerHTML = 
                    new Date().toISOString() + ' - Сервер запущен\\n' +
                    new Date().toISOString() + ' - WebSocket сервер активен\\n' +
                    new Date().toISOString() + ' - База данных подключена';
            </script>
        </body>
        </html>
        `
  }

  async start() {
    try {
      // Инициализируем базу данных
      await this.db.init()
      console.log("✅ База данных инициализирована")

      // Запускаем сервер
      this.server.listen(this.port, () => {
        console.log(`🚀 Mafia Game Server запущен на порту ${this.port}`)
        console.log(`📊 Админ панель: http://localhost:${this.port}/admin`)
        console.log(`🔌 WebSocket: ws://localhost:${this.port}`)
        console.log(`🌐 API: http://localhost:${this.port}/api`)
      })

      // Обработка сигналов завершения
      process.on("SIGTERM", () => this.shutdown())
      process.on("SIGINT", () => this.shutdown())
    } catch (error) {
      console.error("❌ Ошибка запуска сервера:", error)
      process.exit(1)
    }
  }

  async shutdown() {
    console.log("🛑 Завершение работы сервера...")

    try {
      // Закрываем WebSocket соединения
      this.wss.clients.forEach((client) => {
        client.close()
      })

      // Закрываем HTTP сервер
      this.server.close()

      // Закрываем базу данных
      await this.db.close()

      console.log("✅ Сервер успешно завершил работу")
      process.exit(0)
    } catch (error) {
      console.error("❌ Ошибка при завершении работы:", error)
      process.exit(1)
    }
  }
}

// Запуск сервера
if (require.main === module) {
  const server = new MafiaGameServer()
  server.start()
}

module.exports = MafiaGameServer
