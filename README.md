# Coin Catalog Backend API

Backend сервер для приложения каталога монет.

## Установка

```bash
npm install
```

## Настройка

1. Configure Firebase Admin SDK (выберите один из вариантов):

### Вариант A: JSON файл (рекомендуется)
- Скачайте `serviceAccountKey.json` из Firebase Console:
  - Project Settings → Service Accounts → Generate New Private Key
- Поместите файл в корень `back_end/serviceAccountKey.json`

### Вариант B: Переменные окружения
- Создайте `.env` файл на основе `.env.example`:
```bash
cp .env.example .env
```
- Заполните `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- **Важно:** `FIREBASE_PRIVATE_KEY` должен быть в одну строку с `\n` вместо переносов
2. Настройки CORS
3. Порт сервера

## Запуск

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Аутентификация
- `POST /api/v1/auth/register` - Регистрация пользователя
- `POST /api/v1/auth/login` - Вход пользователя
- `POST /api/v1/auth/logout` - Выход пользователя
- `GET /api/v1/auth/verify` - Проверка токена

### Коллекция пользователя
- `GET /api/v1/collection` - Получить коллекцию пользователя
- `POST /api/v1/collection` - Добавить монету в коллекцию
- `PUT /api/v1/collection/:id` - Обновить монету в коллекции
- `DELETE /api/v1/collection/:id` - Удалить монету из коллекции
- `GET /api/v1/collection/stats` - Статистика коллекции

### Список желаний
- `GET /api/v1/wishlist` - Получить список желаний
- `POST /api/v1/wishlist` - Добавить монету в список желаний
- `DELETE /api/v1/wishlist/:id` - Удалить из списка желаний

### Синхронизация
- `POST /api/v1/sync/collection` - Синхронизировать коллекцию
- `POST /api/v1/sync/wishlist` - Синхронизировать список желаний
- `GET /api/v1/sync/status` - Статус синхронизации

## Структура проекта

```
back_end/
├── src/
│   ├── index.js              # Точка входа
│   ├── config/
│   │   ├── firebase.js       # Firebase Admin SDK
│   │   └── cors.js           # CORS настройки
│   ├── middleware/
│   │   ├── auth.js           # Аутентификация
│   │   ├── errorHandler.js   # Обработка ошибок
│   │   └── validation.js     # Валидация данных
│   ├── routes/
│   │   ├── auth.js           # Маршруты аутентификации
│   │   ├── collection.js     # Маршруты коллекции
│   │   ├── wishlist.js       # Маршруты списка желаний
│   │   └── sync.js           # Маршруты синхронизации
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── collectionController.js
│   │   ├── wishlistController.js
│   │   └── syncController.js
│   └── services/
│       ├── firebaseService.js
│       └── collectionService.js
├── package.json
├── .env.example
└── README.md
```
