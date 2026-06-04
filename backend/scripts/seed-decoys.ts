/**
 * Добавляет 15 фиктивных игроков в таблицу лидеров для красивого вида топа.
 * Запускать на сервере:
 *   cd /opt/naval-clash && docker compose -f docker-compose.prod.yml exec app \
 *     npx ts-node --project tsconfig.json scripts/seed-decoys.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DECOYS = [
  { name: 'Дарья',      surname: 'К.',   wins: 23, losses: 8,  totalWon: 18400 },
  { name: 'Анастасия',  surname: 'В.',   wins: 20, losses: 11, totalWon: 15900 },
  { name: 'Михаил',     surname: 'П.',   wins: 18, losses: 9,  totalWon: 14200 },
  { name: 'Валерия',    surname: 'Н.',   wins: 17, losses: 7,  totalWon: 13700 },
  { name: 'Артём',      surname: 'С.',   wins: 16, losses: 10, totalWon: 12500 },
  { name: 'Полина',     surname: 'М.',   wins: 14, losses: 6,  totalWon: 11200 },
  { name: 'Никита',     surname: 'Г.',   wins: 13, losses: 8,  totalWon: 10400 },
  { name: 'Екатерина',  surname: 'Л.',   wins: 12, losses: 5,  totalWon:  9600 },
  { name: 'Дмитрий',    surname: 'Ф.',   wins: 11, losses: 7,  totalWon:  8800 },
  { name: 'Виктория',   surname: 'Ш.',   wins: 10, losses: 4,  totalWon:  7900 },
  { name: 'Александр',  surname: 'Р.',   wins:  9, losses: 6,  totalWon:  7100 },
  { name: 'Алина',      surname: 'Т.',   wins:  8, losses: 5,  totalWon:  6400 },
  { name: 'Иван',       surname: 'Д.',   wins:  7, losses: 3,  totalWon:  5600 },
  { name: 'Ксения',     surname: 'А.',   wins:  6, losses: 4,  totalWon:  4700 },
  { name: 'Роман',      surname: 'Е.',   wins:  5, losses: 2,  totalWon:  3900 },
];

async function main() {
  console.log('Добавляем фиктивных игроков в топ…');

  for (let i = 0; i < DECOYS.length; i++) {
    const d = DECOYS[i];
    const telegramId = `decoy_${String(i + 1).padStart(3, '0')}`;
    const firstName = `${d.name} ${d.surname}`;

    await prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        firstName,
        wins: d.wins,
        losses: d.losses,
        totalWon: d.totalWon,
        totalWagered: d.totalWon + d.losses * 500,
        balance: 0,
      },
      update: {
        firstName,
        wins: d.wins,
        losses: d.losses,
        totalWon: d.totalWon,
      },
    });

    console.log(`  ✓ ${firstName} — ${d.wins}W / ${d.losses}L`);
  }

  console.log('\nГотово! Игроки добавлены в базу.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
