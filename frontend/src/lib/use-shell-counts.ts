import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './api';

/**
 * Ce arată cadrul aplicației în afara paginii: mesajele necitite (badge pe „Mesaje”)
 * și dacă Telegramul e legat (punctul portocaliu de lângă „Notificări Telegram”).
 */
export function useShellCounts(enabled: boolean) {
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);

  const loadMessages = useCallback(() => {
    apiRequest<{ data: Array<{ unread_count?: number }> }>('/conversations')
      .then((response) => setUnreadMessages((response.data ?? []).reduce((sum, item) => sum + (item.unread_count ?? 0), 0)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    loadMessages();
    apiRequest<{ data: { linked: boolean; feature_enabled: boolean; configured: boolean } }>('/telegram/status')
      .then((response) => setTelegramLinked(response.data.feature_enabled && response.data.configured ? response.data.linked : null))
      .catch(() => setTelegramLinked(null));
    const refresh = () => { if (document.visibilityState === 'visible') loadMessages(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('conversation-read', loadMessages);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('conversation-read', loadMessages);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, loadMessages]);

  return { unreadMessages, telegramLinked };
}
