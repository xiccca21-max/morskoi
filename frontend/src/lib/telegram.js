export function getTelegramWebApp() {
    return typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
}
export function getInitData() {
    const tg = getTelegramWebApp();
    if (tg?.initData)
        return tg.initData;
    // В dev можем поднять без Telegram — вернуть пусто.
    return '';
}
export function tgReady() {
    const tg = getTelegramWebApp();
    if (!tg)
        return;
    try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor?.('#050a14');
        tg.setBackgroundColor?.('#050a14');
    }
    catch {
        /* ignore */
    }
}
export function tgHaptic(kind = 'light') {
    const tg = getTelegramWebApp();
    try {
        if (kind === 'success' || kind === 'error' || kind === 'warning') {
            tg?.HapticFeedback?.notificationOccurred?.(kind);
        }
        else {
            tg?.HapticFeedback?.impactOccurred?.(kind);
        }
    }
    catch {
        /* ignore */
    }
}
export function tgShare(url, text) {
    const tg = getTelegramWebApp();
    if (tg?.openTelegramLink) {
        const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        tg.openTelegramLink(link);
    }
    else {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
    }
}
export function tgUserName() {
    const tg = getTelegramWebApp();
    return tg?.initDataUnsafe?.user?.username ?? tg?.initDataUnsafe?.user?.first_name;
}
