# 🚀 Настройка проекта в Android Studio

## 📋 Требования
- Android Studio Flamingo (2022.2.1) или новее
- JDK 11 или новее
- Android SDK 34
- Gradle 8.0+

## 🔧 Пошаговая настройка

### 1. Открытие проекта
1. Запустите Android Studio
2. Выберите "Open an Existing Project"
3. Выберите папку с проектом (где находится build.gradle)
4. Дождитесь синхронизации Gradle

### 2. Настройка SDK
1. File → Project Structure → Project
2. Убедитесь что Gradle Version: 8.0
3. Android Gradle Plugin Version: 8.1.2

### 3. Настройка эмулятора
1. Tools → AVD Manager
2. Create Virtual Device
3. Выберите Pixel 6 или любое современное устройство
4. API Level 34 (Android 14)

### 4. Сборка проекта
1. Build → Clean Project
2. Build → Rebuild Project
3. Если ошибки - проверьте версии в build.gradle

### 5. Запуск
1. Подключите устройство или запустите эмулятор
2. Run → Run 'app'

## ⚠️ Возможные проблемы

### Gradle sync failed
\`\`\`bash
# Очистите кэш Gradle
./gradlew clean
# Или в Android Studio: File → Invalidate Caches and Restart
\`\`\`

### SDK не найден
\`\`\`bash
# В local.properties добавьте:
sdk.dir=/path/to/your/Android/Sdk
\`\`\`

### Ошибки компиляции
- Проверьте версию Java (должна быть 11+)
- Обновите Android Studio до последней версии
- Синхронизируйте проект: File → Sync Project with Gradle Files

## 🎯 Готово!
После успешной сборки вы увидите приложение "Мафия Игра" на устройстве.
