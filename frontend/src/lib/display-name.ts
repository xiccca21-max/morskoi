/** Единый порядок отображения имени игрока во всех экранах. */
export function displayName(u: {
  nickname?: string | null;
  username?: string | null;
  firstName?: string | null;
  id?: string;
} | null | undefined): string {
  if (!u) return 'Игрок';
  return (
    u.nickname?.trim() ||
    u.firstName?.trim() ||
    u.username?.trim() ||
    (u.id ? `Player-${u.id.slice(0, 4)}` : 'Игрок')
  );
}
