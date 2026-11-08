# TimeManager backend

Запуск:

```bash
cd backend
node server.js
```

API: `http://localhost:3000`

Маршруты:

- `POST /api/auth/login` — вход;
- `GET /api/me` — текущий пользователь;
- `GET /api/shifts/mine` — смены сотрудника;
- `POST /api/shifts/events` — отметка `start` или `end` с `latitude`, `longitude`, `recordedAt`, `offline`;
- `GET /api/shifts` — журнал для руководителя/администратора;
- `GET /api/users` — список пользователей для администратора;
- `POST /api/users` — создание пользователя администратором.
- `GET /api/objects` — список объектов для всех авторизованных пользователей;
- `POST /api/objects` — создание объекта руководителем или менеджером;
- `POST /api/objects/:id/comments` — комментарий к объекту для любого авторизованного пользователя.

Роли: `admin`, `supervisor` (руководитель), `manager` (менеджер), `employee` (сотрудник).

Для продакшена задайте `SESSION_SECRET`, `CORS_ORIGIN` и замените JSON-хранилище на PostgreSQL/другую серверную БД.
