/**
 * Добавляет 15 фиктивных игроков в таблицу лидеров для красивого вида топа.
 * Запускать на сервере:
 *   cd /opt/naval-clash && docker compose -f docker-compose.prod.yml exec app \
 *     npx ts-node --project tsconfig.json scripts/seed-decoys.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Аватарки через DiceBear — бесплатно, всегда доступны, уникальны
const avatar = (seed: string, style = 'bottts') =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

const DECOYS = [
  { username: 'CaliLinux',    firstName: 'CaliLinux',    avatar: avatar('CaliLinux',   'bottts'),        wins: 23, losses: 8,  totalWon: 18400 },
  { username: 'Rocketeer',    firstName: 'Rocketeer',    avatar: avatar('Rocket',      'bottts-neutral'), wins: 20, losses: 11, totalWon: 15900 },
  { username: 'SharkBite',    firstName: 'SharkBite',    avatar: avatar('Shark',       'lorelei'),        wins: 18, losses: 9,  totalWon: 14200 },
  { username: 'DemonKing',    firstName: 'DemonKing',    avatar: avatar('Demon',       'adventurer'),     wins: 17, losses: 7,  totalWon: 13700 },
  { username: 'NightOwl',     firstName: 'NightOwl',     avatar: avatar('Owl',         'bottts'),         wins: 16, losses: 10, totalWon: 12500 },
  { username: 'IronWolf',     firstName: 'IronWolf',     avatar: avatar('Wolf',        'bottts-neutral'), wins: 14, losses: 6,  totalWon: 11200 },
  { username: 'VoidWalker',   firstName: 'VoidWalker',   avatar: avatar('Void',        'adventurer'),     wins: 13, losses: 8,  totalWon: 10400 },
  { username: 'ThunderBolt',  firstName: 'ThunderBolt',  avatar: avatar('Thunder',     'bottts'),         wins: 12, losses: 5,  totalWon:  9600 },
  { username: 'CyberPunk',    firstName: 'CyberPunk',    avatar: avatar('Cyber',       'lorelei'),        wins: 11, losses: 7,  totalWon:  8800 },
  { username: 'DeepSea',      firstName: 'DeepSea',      avatar: avatar('DeepSea',     'bottts-neutral'), wins: 10, losses: 4,  totalWon:  7900 },
  { username: 'StormBreaker', firstName: 'StormBreaker', avatar: avatar('Storm',       'adventurer'),     wins:  9, losses: 6,  totalWon:  7100 },
  { username: 'SilverFox',    firstName: 'SilverFox',    avatar: avatar('Fox',         'bottts'),         wins:  8, losses: 5,  totalWon:  6400 },
  { username: 'NeonRider',    firstName: 'NeonRider',    avatar: avatar('Neon',        'lorelei'),        wins:  7, losses: 3,  totalWon:  5600 },
  { username: 'DarkMatter',   firstName: 'DarkMatter',   avatar: avatar('Dark',        'adventurer'),     wins:  6, losses: 4,  totalWon:  4700 },
  { username: 'SpeedRacer',   firstName: 'SpeedRacer',   avatar: avatar('Speed',       'bottts-neutral'), wins:  5, losses: 2,  totalWon:  3900 },
];

async function main() {
  console.log('Добавляем фиктивных игроков в топ…');

  for (let i = 0; i < DECOYS.length; i++) {
    const d = DECOYS[i];
    const telegramId = `decoy_${String(i + 1).padStart(3, '0')}`;

    await prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        username: d.username,
        firstName: d.firstName,
        avatar: d.avatar,
        wins: d.wins,
        losses: d.losses,
        totalWon: d.totalWon,
        totalWagered: d.totalWon + d.losses * 500,
        balance: 0,
      },
      update: {
        username: d.username,
        firstName: d.firstName,
        avatar: d.avatar,
        wins: d.wins,
        losses: d.losses,
        totalWon: d.totalWon,
      },
    });

    console.log(`  ✓ ${d.username} — ${d.wins}W / ${d.losses}L`);
  }

  console.log('\nГотово! Игроки добавлены в базу.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
