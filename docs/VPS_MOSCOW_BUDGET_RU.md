# VPS Москва без Timeweb — что купить и что нажимать

Инструкция для Naval Clash (Telegram Mini App).  
Рекомендуем **FirstVDS** (дешевле) или **REG.RU** (VPS + домен в одном кабинете).

---

## Сколько денег

| Что | Где | Цена |
|-----|-----|------|
| VPS 2 GB, Москва | **FirstVDS** «Старт SSD» | **~440–510 ₽/мес** |
| VPS 2 GB, Москва | **REG.RU** Std C2-M2-D40 | **~980 ₽/мес** |
| Домен `.ru` | REG.RU / FirstVDS | **~169–450 ₽/год** |
| HTTPS | Let's Encrypt | **0 ₽** |

**Дешевле всего:** FirstVDS + домен на REG.RU ≈ **600–900 ₽ на старт**.

---

## Что покупать — ДА

1. VPS Linux, **локация Москва**, **Ubuntu 22.04**, **2 GB RAM**, **публичный IPv4**
2. Домен `.ru`
3. DNS: A-запись `game` → IP сервера

## Что НЕ покупать

- Timeweb (если не хочешь — не нужен)
- Railway, хостинг «для сайтов», PostgreSQL/Redis в облаке
- Платный SSL, DDoS-премиум, бэкапы на старте (можно позже)
- 4 GB RAM — для тестов лишнее

---

# ВАРИАНТ A — FirstVDS (самый дешёвый, Москва)

Сайт: https://firstvds.ru

## A1. Регистрация

1. Регистрация → подтверди email  
2. Пополни баланс **~600 ₽** (месяц VPS + запас)

## A2. Заказ сервера

1. **Продукты** → **VPS/VDS** → тариф **«Старт SSD»** (или **Старт NVMe** — чуть дороже)  
2. Параметры:

| Поле | Значение |
|------|----------|
| Локация | **Москва** (Россия) |
| ОС | **Ubuntu 22.04** |
| RAM | **2 GB** (в тарифе «Старт» уже есть) |
| Диск | 40 GB — достаточно |
| IPv4 | **включён** (обычно по умолчанию) |

3. **Доп. услуги — всё выключи:**
   - DDoS защита 250 ₽ — **нет**
   - Автобэкапы — **нет**
   - Панель ISPmanager — **нет** (будем Docker в SSH)

4. Промокод (если есть): `WELCOMEONE` — скидка на первый месяц (на странице акций FirstVDS)

5. **Заказать** → дождись письма с **IP**, **логин root**, **пароль**

## A3. Панель FirstVDS

Запиши из письма / личного кабинета:

- **IP** сервера  
- **Пароль root**

SSH с Windows:

```powershell
ssh root@IP_СЕРВЕРА
```

Дальше — **общая установка игры** (раздел «Установка на сервере» внизу).

---

# ВАРИАНТ B — REG.RU (VPS + домен в одном месте)

Сайт: https://www.reg.ru/vps/

## B1. Домен (можно сначала)

1. https://www.reg.ru → купи **`.ru`** (например `morskoi.ru`)  
2. Без лишних галочек «конструктор», «почта»

## B2. VPS

1. **VPS/VDS** → конфигуратор  
2. Выбери:

| Поле | Значение |
|------|----------|
| Регион | **Москва** |
| ОС | **Ubuntu 22.04** |
| Тариф | **Std C2-M2-D40** (2 CPU, 2 GB, 40 GB) — ~980 ₽/мес |
| Публичный IP | **да** |

3. Бэкапы и доп. опции — **не включай**  
4. Создать → запиши **IP** и доступ **root**

## B3. DNS (в том же REG.RU)

Домен → **DNS** → добавь:

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `game` | IP VPS |

Игра: `https://game.morskoi.ru`

---

# Установка на сервере (FirstVDS и REG.RU одинаково)

## 1. DNS готов

С ПК:

```powershell
nslookup game.твой-домен.ru
```

Должен быть IP VPS.

## 2. Код на GitHub (с ПК)

```powershell
cd "c:\Users\fanis\OneDrive\Desktop\морской бой"
git add .
git commit -m "deploy"
git push origin main
```

## 3. SSH на сервер

```powershell
ssh root@IP_СЕРВЕРА
```

## 4. Файл `.env`

```bash
git clone https://github.com/xiccca21-max/morskoi.git /opt/naval-clash
cd /opt/naval-clash
cp .env.production.example .env
nano .env
```

Заполни (свой домен и токен бота):

```env
NODE_ENV=production
JWT_SECRET=результат_команды_openssl_rand
JWT_EXPIRES_IN=7d
TELEGRAM_BOT_TOKEN=токен_BotFather
TELEGRAM_BOT_USERNAME=имя_бота_без_@
TELEGRAM_WEBAPP_URL=https://game.твой-домен.ru
TELEGRAM_BOT_POLLING=false
CORS_ORIGINS=https://game.твой-домен.ru
```

```bash
openssl rand -hex 32
```

Сохранить nano: Ctrl+O → Enter → Ctrl+X.

## 5. SSL + запуск

```bash
cd /opt/naval-clash
chmod +x scripts/*.sh
sudo ./scripts/vps-setup.sh game.твой-домен.ru твой@email.com
```

Жди 5–15 минут.

```bash
curl https://game.твой-домен.ru/health
```

## 6. BotFather

`/mybots` → бот → **Menu Button** → URL: `https://game.твой-домен.ru`, текст: `Play`

---

# Обновления

```bash
cd /opt/naval-clash && ./scripts/deploy.sh
```

---

# Сравнение провайдеров

| | FirstVDS | REG.RU | Timeweb |
|--|----------|--------|---------|
| Цена 2 GB Москва | **~440 ₽** | ~980 ₽ | ~880 ₽ |
| Домен | отдельно | **в одном кабинете** | отдельно |
| Интерфейс | проще, меньше «навязанного» | привычный REG | много доп. услуг |

**Вывод:** не хочешь Timeweb → бери **FirstVDS** (дешевле) + домен на **REG.RU**.

---

# Если не работает

| Проблема | Решение |
|----------|---------|
| Серый экран в Telegram | URL в BotFather = тот же https |
| certbot ошибка | DNS на VPS, порты 80/443 открыты |
| 502 | `docker compose -f docker-compose.prod.yml logs app` |

Перезапуск:

```bash
cd /opt/naval-clash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```
