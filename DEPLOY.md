# Деплой на VPS в Москве (без Timeweb)

**Полная инструкция:** [docs/VPS_MOSCOW_BUDGET_RU.md](./docs/VPS_MOSCOW_BUDGET_RU.md)

## Коротко что купить

1. **VPS** — [FirstVDS](https://firstvds.ru) → **Старт SSD**, **Москва**, Ubuntu 22.04, 2 GB (~440 ₽/мес)  
   *или* [REG.RU VPS](https://www.reg.ru/vps/) — Москва, 2 GB (~980 ₽/мес, зато домен там же)

2. **Домен `.ru`** — на [REG.RU](https://www.reg.ru) (~169–450 ₽/год)

3. **DNS:** A-запись `game` → IP сервера

4. На сервере: `git clone` → `.env` → `sudo ./scripts/vps-setup.sh game.домен.ru email`

5. **BotFather** → Menu Button → `https://game.домен.ru`
