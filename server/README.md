# 🎭 Mafia Game Server

Сервер для многопользовательской игры "Мафия" с поддержкой WebSocket.

## 🚀 Быстрый старт

### Локальная разработка
\`\`\`bash
npm install
npm run dev
\`\`\`

### Продакшн
\`\`\`bash
npm install
npm start
\`\`\`

## 🌐 Развертывание на Render

1. **Создайте аккаунт на [Render.com](https://render.com)**

2. **Подключите GitHub репозиторий:**
   - New → Web Service
   - Connect GitHub repository
   - Выберите ваш репозиторий

3. **Настройки сервиса:**
   - **Name:** mafia-game-server
   - **Environment:** Node
   - **Build Command:** \`npm install\`
   - **Start Command:** \`npm start\`
   - **Root Directory:** \`server\`

4. **Environment Variables:**
   - \`NODE_ENV=production\`
   - \`PORT=10000\` (Render автоматически установит)

5. **Deploy!**

## 📱 Настройка Android приложения

После деплоя на Render обновите URL в Android приложении:

\`\`\`javascript
// В app/src/main/assets/index.html
const SERVER_URL = 'wss://your-app-name.onrender.com';
const API_URL = 'https://your-app-name.onrender.com/api';
\`\`\`

## 🔧 Особенности Render

- ✅ Автоматический SSL (HTTPS/WSS)
- ✅ Глобальный CDN
- ✅ Автоматические деплои
- ✅ Мониторинг и логи
- ✅ Бесплатный план (750 часов/месяц)

## 📊 Мониторинг

- **Админ панель:** https://your-app-name.onrender.com/admin
- **API статус:** https://your-app-name.onrender.com/api/health
- **Логи:** В панели Render

## ⚠️ Важные моменты

1. **Холодный старт:** Бесплатные сервисы засыпают через 15 минут неактивности
2. **База данных:** SQLite файл сохраняется между деплоями
3. **WebSocket:** Полная поддержка в реальном времени

## 🎮 Игровые функции

- 👥 Многопользовательские комнаты
- 💬 Чат в реальном времени  
- 🎭 Система ролей
- ⏱️ Автоматические таймеры
- 📊 Статистика игроков
