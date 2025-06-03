class GameEngine {
  constructor() {
    this.games = new Map() // gameId -> game state
  }

  createGame(players, roles) {
    const gameId = "game_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)

    // Перемешиваем игроков
    const shuffledPlayers = this.shuffleArray([...players])

    // Распределяем роли
    const gameRoles = this.distributeRoles(shuffledPlayers, roles)

    const gameState = {
      id: gameId,
      players: gameRoles,
      phase: "night", // night, day, voting
      day: 1,
      alive: shuffledPlayers.map((p) => p.nickname),
      dead: [],
      votes: {},
      actions: {},
      history: [],
      winner: null,
      startTime: new Date(),
    }

    this.games.set(gameId, gameState)

    return gameState
  }

  distributeRoles(players, enabledRoles) {
    const playerCount = players.length
    const roles = this.calculateRoleDistribution(playerCount, enabledRoles)

    // Создаем массив ролей
    const roleArray = []

    // Добавляем мафию
    for (let i = 0; i < roles.mafia; i++) {
      roleArray.push("mafia")
    }

    // Добавляем шерифа
    if (roles.sheriff > 0) {
      roleArray.push("sheriff")
    }

    // Добавляем доктора
    if (roles.doctor > 0) {
      roleArray.push("doctor")
    }

    // Добавляем маньяка
    if (roles.maniac > 0) {
      roleArray.push("maniac")
    }

    // Добавляем любовников
    if (roles.lover > 0) {
      roleArray.push("lover", "lover")
    }

    // Заполняем оставшиеся места мирными
    while (roleArray.length < playerCount) {
      roleArray.push("civilian")
    }

    // Перемешиваем роли
    const shuffledRoles = this.shuffleArray(roleArray)

    // Назначаем роли игрокам
    return players.map((player, index) => ({
      ...player,
      role: shuffledRoles[index],
      isAlive: true,
      votes: 0,
    }))
  }

  calculateRoleDistribution(playerCount, enabledRoles) {
    const roles = {
      mafia: 0,
      sheriff: 0,
      doctor: 0,
      maniac: 0,
      lover: 0,
      civilian: 0,
    }

    // Базовое распределение в зависимости от количества игроков
    if (playerCount >= 4) {
      roles.mafia = 1
      roles.sheriff = 1
    }

    if (playerCount >= 6) {
      roles.mafia = 2
    }

    if (playerCount >= 8) {
      if (enabledRoles.includes("doctor")) {
        roles.doctor = 1
      }
    }

    if (playerCount >= 10) {
      roles.mafia = 3
    }

    if (playerCount >= 12) {
      if (enabledRoles.includes("maniac")) {
        roles.maniac = 1
      }
    }

    if (playerCount >= 8 && enabledRoles.includes("lover")) {
      roles.lover = 2
    }

    // Корректируем количество мафии если включены другие роли
    const specialRoles = roles.sheriff + roles.doctor + roles.maniac + roles.lover
    const maxMafia = Math.floor((playerCount - specialRoles) / 3)
    roles.mafia = Math.min(roles.mafia, maxMafia)

    // Остальные - мирные
    roles.civilian = playerCount - roles.mafia - roles.sheriff - roles.doctor - roles.maniac - roles.lover

    return roles
  }

  shuffleArray(array) {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // Игровые действия
  processNightAction(gameId, playerId, action) {
    const game = this.games.get(gameId)
    if (!game || game.phase !== "night") return false

    game.actions[playerId] = action

    // Проверяем, все ли активные роли сделали ход
    if (this.allNightActionsComplete(game)) {
      this.resolveNightActions(game)
      this.startDay(game)
    }

    return true
  }

  processDayVote(gameId, voterId, targetId) {
    const game = this.games.get(gameId)
    if (!game || game.phase !== "voting") return false

    game.votes[voterId] = targetId

    // Проверяем, все ли проголосовали
    const alivePlayers = game.players.filter((p) => p.isAlive)
    const voteCount = Object.keys(game.votes).length

    if (voteCount >= alivePlayers.length) {
      this.resolveVoting(game)
    }

    return true
  }

  allNightActionsComplete(game) {
    const activeRoles = game.players.filter(
      (p) => p.isAlive && ["mafia", "sheriff", "doctor", "maniac"].includes(p.role),
    )

    return activeRoles.every((player) => game.actions[player.nickname])
  }

  resolveNightActions(game) {
    const actions = game.actions
    const killed = []
    const protectedPlayers = []
    const checked = []

    // Обрабатываем действия доктора (защита)
    Object.entries(actions).forEach(([playerId, action]) => {
      const player = game.players.find((p) => p.nickname === playerId)
      if (player && player.role === "doctor" && action.type === "heal") {
        protectedPlayers.push(action.target)
      }
    })

    // Обрабатываем убийства
    Object.entries(actions).forEach(([playerId, action]) => {
      const player = game.players.find((p) => p.nickname === playerId)
      if (player && ["mafia", "maniac"].includes(player.role) && action.type === "kill") {
        if (!protectedPlayers.includes(action.target)) {
          killed.push(action.target)
        }
      }
    })

    // Обрабатываем проверки шерифа
    Object.entries(actions).forEach(([playerId, action]) => {
      const player = game.players.find((p) => p.nickname === playerId)
      if (player && player.role === "sheriff" && action.type === "check") {
        const target = game.players.find((p) => p.nickname === action.target)
        checked.push({
          sheriff: playerId,
          target: action.target,
          result: target && target.role === "mafia" ? "mafia" : "innocent",
        })
      }
    })

    // Применяем результаты
    killed.forEach((playerId) => {
      const player = game.players.find((p) => p.nickname === playerId)
      if (player) {
        player.isAlive = false
        game.alive = game.alive.filter((id) => id !== playerId)
        game.dead.push(playerId)
      }
    })

    // Сохраняем результаты ночи
    game.history.push({
      phase: "night",
      day: game.day,
      killed: killed,
      protected: protectedPlayers,
      checked: checked,
      actions: { ...actions },
    })

    // Очищаем действия
    game.actions = {}
  }

  resolveVoting(game) {
    const votes = game.votes
    const voteCount = {}

    // Подсчитываем голоса
    Object.values(votes).forEach((target) => {
      voteCount[target] = (voteCount[target] || 0) + 1
    })

    // Находим игрока с максимальным количеством голосов
    let maxVotes = 0
    let eliminated = null

    Object.entries(voteCount).forEach(([playerId, count]) => {
      if (count > maxVotes) {
        maxVotes = count
        eliminated = playerId
      }
    })

    // Исключаем игрока
    if (eliminated) {
      const player = game.players.find((p) => p.nickname === eliminated)
      if (player) {
        player.isAlive = false
        game.alive = game.alive.filter((id) => id !== eliminated)
        game.dead.push(eliminated)
      }
    }

    // Сохраняем результаты голосования
    game.history.push({
      phase: "voting",
      day: game.day,
      votes: { ...votes },
      eliminated: eliminated,
      voteCount: voteCount,
    })

    // Очищаем голоса
    game.votes = {}

    // Проверяем условия победы
    if (this.checkWinConditions(game)) {
      return
    }

    // Переходим к ночи
    this.startNight(game)
  }

  startDay(game) {
    game.phase = "day"

    // Проверяем условия победы
    if (this.checkWinConditions(game)) {
      return
    }
  }

  startVoting(game) {
    game.phase = "voting"
  }

  startNight(game) {
    game.phase = "night"
    game.day++
  }

  checkWinConditions(game) {
    const alivePlayers = game.players.filter((p) => p.isAlive)
    const aliveMafia = alivePlayers.filter((p) => p.role === "mafia")
    const aliveCivilians = alivePlayers.filter((p) => ["civilian", "sheriff", "doctor"].includes(p.role))
    const aliveManiac = alivePlayers.filter((p) => p.role === "maniac")

    // Победа маньяка
    if (aliveManiac.length > 0 && alivePlayers.length === 1) {
      game.winner = "maniac"
      game.phase = "ended"
      return true
    }

    // Победа мафии
    if (aliveMafia.length >= aliveCivilians.length && aliveManiac.length === 0) {
      game.winner = "mafia"
      game.phase = "ended"
      return true
    }

    // Победа мирных
    if (aliveMafia.length === 0 && aliveManiac.length === 0) {
      game.winner = "civilians"
      game.phase = "ended"
      return true
    }

    return false
  }

  getGameState(gameId) {
    return this.games.get(gameId)
  }

  getPlayerRole(gameId, playerId) {
    const game = this.games.get(gameId)
    if (!game) return null

    const player = game.players.find((p) => p.nickname === playerId)
    return player ? player.role : null
  }

  getGameStats() {
    return {
      activeGames: this.games.size,
      totalPlayers: Array.from(this.games.values()).reduce((sum, game) => sum + game.players.length, 0),
    }
  }
}

module.exports = GameEngine
