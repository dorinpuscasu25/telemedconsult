import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './api';
import { needsDoctor, stageOf, type Stage } from './doctor';

const NEWS_SEEN_KEY = 'news-seen-at';

/** Momentul ultimei vizite în Noutăți, păstrat pe dispozitiv. */
export function markNewsSeen() {
  try { window.localStorage.setItem(NEWS_SEEN_KEY, new Date().toISOString()); } catch { /* stocare blocată */ }
  window.dispatchEvent(new Event('news-seen'));
}

export function newsSeenAt(): number {
  try { return new Date(window.localStorage.getItem(NEWS_SEEN_KEY) ?? 0).getTime() || 0; } catch { return 0; }
}

/**
 * Ce arată cadrul aplicației în afara paginii: mesajele necitite (badge pe „Mesaje”),
 * cererile care așteaptă medicul (badge pe „Consultații”), anunțurile necitite
 * și dacă Telegramul e legat (punctul de lângă „Notificări Telegram”).
 */
export function useShellCounts(enabled: boolean, role?: string | null) {
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [unreadNews, setUnreadNews] = useState(0);
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);
  const isDoctor = role === 'doctor';
  const isOperator = role === 'operator';

  const loadMessages = useCallback(() => {
    apiRequest<{ data: Array<{ unread_count?: number }> }>('/conversations')
      .then((response) => setUnreadMessages((response.data ?? []).reduce((sum, item) => sum + (item.unread_count ?? 0), 0)))
      .catch(() => undefined);
  }, []);

  const loadRequests = useCallback(() => {
    if (!isDoctor && !isOperator) return;
    apiRequest<{ data: Array<{ stage?: Stage; status: string; doctor_started_at?: string | null }> }>('/requests')
      .then((response) => setPendingRequests((response.data ?? []).filter((item) => (isOperator ? item.status === 'new' : needsDoctor(stageOf(item)))).length))
      .catch(() => undefined);
  }, [isDoctor, isOperator]);

  const loadNews = useCallback(() => {
    if (!isDoctor) return;
    apiRequest<{ data: Array<{ published_at: string | null }> }>('/catalog/blog?audience=doctors', { auth: false })
      .then((response) => {
        const seen = newsSeenAt();
        setUnreadNews((response.data ?? []).filter((post) => post.published_at && new Date(post.published_at).getTime() > seen).length);
      })
      .catch(() => undefined);
  }, [isDoctor]);

  useEffect(() => {
    if (!enabled) return;
    loadMessages();
    loadRequests();
    loadNews();
    apiRequest<{ data: { linked: boolean; feature_enabled: boolean; configured: boolean } }>('/telegram/status')
      .then((response) => setTelegramLinked(response.data.feature_enabled && response.data.configured ? response.data.linked : null))
      .catch(() => setTelegramLinked(null));
    const refresh = () => { if (document.visibilityState === 'visible') { loadMessages(); loadRequests(); } };
    const seen = () => setUnreadNews(0);
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('conversation-read', loadMessages);
    window.addEventListener('requests-changed', loadRequests);
    window.addEventListener('news-seen', seen);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('conversation-read', loadMessages);
      window.removeEventListener('requests-changed', loadRequests);
      window.removeEventListener('news-seen', seen);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, loadMessages, loadRequests, loadNews]);

  return { unreadMessages, pendingRequests, unreadNews, telegramLinked };
}
