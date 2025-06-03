class WebSocketHandler {
  constructor(wss, database, gameEngine) {
    this.wss = wss
    this.db = database
    this.gameEngine = gameEngine
    this.clients = new Map() // userId -> ws
    this.rooms = new Map() // roomId -> room data
    this.gameTimers = new Map() // roomId -> timer

    this.setupWebSocket()
  }

  setupWebSocket() {
    this.wss.on("connection", (ws) => {
      console.log("Новое WebSocket подключение")

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message)
          this.handleMessage(ws, data)
        } catch (error) {
          console.error("Ошибка парсинга сообщения:", error)
          this.sendError(ws, "Неверный формат сообщения")
        }
      })

      ws.on("close", () => {
        this.handleDisconnect(ws)
      })

      ws.on("error", (error) => {
        console.error("WebSocket ошибка:", error)
      })
    })
  }

  handleMessage(ws, data) {
    switch (data.type) {
      case "user_connected":
        this.handleUserConnected(ws, data.user)
        break
      case "create_room":
        this.handleCreateRoom(ws, data)
        break
      case "join_room":
        this.handleJoinRoom(ws, data)
        break
      case "leave_room":
        this.handleLeaveRoom(ws, data)
        break
      case "chat_message":
        this.handleChatMessage(ws, data)
        break
      case "get_rooms":
        this.handleGetRooms(ws)
        break
      default:
        this.sendError(ws, "Неизвестный тип сообщения")
    }
  }

  handleUserConnected(ws, user) {
    ws.userId = user.nickname
    this.clients.set(user.nickname, ws)
    console.log(`Пользователь ${user.nickname} подключился`)

    // Отправляем список комнат
    this.sendRoomsList(ws)
  }

  handleCreateRoom(ws, data) {
    const roomId = "room_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)

    const room = {
      id: roomId,
      name: data.name,
      creator: data.creator,
      players: [data.creator],
      minPlayers: data.minPlayers,
      maxPlayers: data.maxPlayers,
      roles: data.roles,
      status: "waiting",
      createdAt: new Date(),
      gameData: null,
    }

    this.rooms.set(roomId, room)

    // Сохраняем комнату в базу данных
    this.db.createRoom(room).catch(console.error)

    // Отправляем создателю информацию о комнате
    this.send(ws, {
      type: "room_created",
      room: room,
    })

    // Уведомляем всех о новой комнате
    this.broadcastRoomsList()

    console.log(`Комната "${room.name}" создана пользователем ${data.creator.nickname}`)
  }

  handleJoinRoom(ws, data) {
    const room = this.rooms.get(data.roomId)

    if (!room) {
      this.sendError(ws, "Комната не найдена")
      return
    }

    if (room.status !== "waiting") {
      this.sendError(ws, "Игра уже началась")
      return
    }

    if (room.players.length >= room.maxPlayers) {
      this.sendError(ws, "Комната заполнена")
      return
    }

    // Проверяем, не находится ли игрок уже в комнате
    if (room.players.find((p) => p.nickname === data.user.nickname)) {
      this.sendError(ws, "Вы уже в этой комнате")
      return
    }

    // Добавляем игрока в комнату
    room.players.push(data.user)

    // Отправляем игроку информацию о комнате
    this.send(ws, {
      type: "room_joined",
      room: room,
    })

    // Уведомляем всех игроков в комнате о новом игроке
    this.broadcastToRoom(room.id, {
      type: "player_joined",
      player: data.user,
      room: room,
    })

    // Проверяем, нужно ли начинать игру
    this.checkGameStart(room)

    // Обновляем список комнат для всех
    this.broadcastRoomsList()

    console.log(`${data.user.nickname} присоединился к комнате "${room.name}"`)
  }

  handleLeaveRoom(ws, data) {
    const room = this.rooms.get(data.roomId)

    if (!room) {
      this.sendError(ws, "Комната не найдена")
      return
    }

    // Удаляем игрока из комнаты
    room.players = room.players.filter((p) => p.nickname !== data.user.nickname)

    // Останавливаем таймер если он был запущен
    this.stopGameTimer(room.id)

    // Если комната пустая, удаляем её
    if (room.players.length === 0) {
      this.rooms.delete(room.id)
      this.db.deleteRoom(room.id).catch(console.error)
    } else {
      // Уведомляем оставшихся игроков
      this.broadcastToRoom(room.id, {
        type: "player_left",
        player: data.user,
        room: room,
      })
    }

    // Обновляем список комнат
    this.broadcastRoomsList()

    console.log(`${data.user.nickname} покинул комнату "${room.name}"`)
  }

  handleChatMessage(ws, data) {
    const room = this.rooms.get(data.roomId)

    if (!room) {
      this.sendError(ws, "Комната не найдена")
      return
    }

    // Проверяем, что отправитель находится в комнате
    if (!room.players.find((p) => p.nickname === data.sender)) {
      this.sendError(ws, "Вы не находитесь в этой комнате")
      return
    }

    // Сохраняем сообщение в базу данных
    this.db
      .saveMessage({
        roomId: data.roomId,
        sender: data.sender,
        message: data.message,
        timestamp: new Date(),
      })
      .catch(console.error)

    // Отправляем сообщение всем игрокам в комнате
    this.broadcastToRoom(data.roomId, {
      type: "chat_message",
      sender: data.sender,
      message: data.message,
      timestamp: new Date(),
    })
  }

  handleGetRooms(ws) {
    this.sendRoomsList(ws)
  }

  checkGameStart(room) {
    if (room.status !== "waiting") return

    if (room.players.length >= room.maxPlayers) {
      // Начинаем игру немедленно
      this.startGame(room)
    } else if (room.players.length >= room.minPlayers) {
      // Запускаем таймер на 15 секунд
      this.startGameTimer(room)
    }
  }

  startGameTimer(room) {
    // Останавливаем предыдущий таймер если он был
    this.stopGameTimer(room.id)

    let countdown = 15

    // Уведомляем игроков о начале таймера
    this.broadcastToRoom(room.id, {
      type: "game_starting",
      countdown: countdown,
    })

    const timer = setInterval(() => {
      countdown--

      if (countdown <= 0) {
        this.stopGameTimer(room.id)
        this.startGame(room)
      } else {
        this.broadcastToRoom(room.id, {
          type: "game_starting",
          countdown: countdown,
        })
      }
    }, 1000)

    this.gameTimers.set(room.id, timer)
  }

  stopGameTimer(roomId) {
    const timer = this.gameTimers.get(roomId)
    if (timer) {
      clearInterval(timer)
      this.gameTimers.delete(roomId)
    }
  }

  startGame(room) {
    room.status = "playing"

    // Создаем игровые данные
    const gameData = this.gameEngine.createGame(room.players, room.roles)
    room.gameData = gameData

    // Сохраняем начало игры в базу данных
    this.db.startGame(room.id, gameData).catch(console.error)

    // Уведомляем игроков о начале игры
    this.broadcastToRoom(room.id, {
      type: "game_started",
      gameData: gameData,
    })

    // Обновляем список комнат
    this.broadcastRoomsList()

    console.log(`Игра началась в комнате "${room.name}"`)
  }

  handleDisconnect(ws) {
    if (ws.userId) {
      console.log(`Пользователь ${ws.userId} отключился`)
      this.clients.delete(ws.userId)

      // Удаляем игрока из всех комнат
      for (const [roomId, room] of this.rooms) {
        const playerIndex = room.players.findIndex((p) => p.nickname === ws.userId)
        if (playerIndex !== -1) {
          const player = room.players[playerIndex]
          room.players.splice(playerIndex, 1)

          // Останавливаем таймер
          this.stopGameTimer(roomId)

          if (room.players.length === 0) {
            this.rooms.delete(roomId)
            this.db.deleteRoom(roomId).catch(console.error)
          } else {
            this.broadcastToRoom(roomId, {
              type: "player_left",
              player: player,
              room: room,
            })
          }
        }
      }

      this.broadcastRoomsList()
    }
  }

  // Утилиты для отправки сообщений
  send(ws, data) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }

  sendError(ws, message) {
    this.send(ws, {
      type: "error",
      message: message,
    })
  }

  sendRoomsList(ws) {
    const roomsList = Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      name: room.name,
      players: room.players,
      maxPlayers: room.maxPlayers,
      minPlayers: room.minPlayers,
      roles: room.roles,
      status: room.status,
    }))

    this.send(ws, {
      type: "rooms_list",
      rooms: roomsList,
    })
  }

  broadcastRoomsList() {
    const roomsList = Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      name: room.name,
      players: room.players,
      maxPlayers: room.maxPlayers,
      minPlayers: room.minPlayers,
      roles: room.roles,
      status: room.status,
    }))

    this.wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        this.send(client, {
          type: "rooms_list",
          rooms: roomsList,
        })
      }
    })
  }

  broadcastToRoom(roomId, data) {
    const room = this.rooms.get(roomId)
    if (!room) return

    room.players.forEach((player) => {
      const ws = this.clients.get(player.nickname)
      if (ws) {
        this.send(ws, data)
      }
    })
  }

  // Получение статистики
  getStats() {
    return {
      connectedUsers: this.clients.size,
      activeRooms: this.rooms.size,
      totalPlayers: Array.from(this.rooms.values()).reduce((sum, room) => sum + room.players.length, 0),
    }
  }
}

module.exports = WebSocketHandler
