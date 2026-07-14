import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu';
import { apiRequest } from '../lib/api';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  url?: string | null;
  read_at?: string | null;
  created_at: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  const loadNotifications = () => {
    apiRequest<{data: AppNotification[]; unread_count: number}>('/notifications')
      .then((response) => {
        setNotifications(response.data);
        setUnreadCount(response.unread_count);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const markRead = async () => {
    await apiRequest('/notifications/read', { method: 'POST' });
    setUnreadCount(0);
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && loadNotifications()}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="relative rounded-xl bg-white/70">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-5 text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notificări</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button type="button" onClick={markRead} className="text-xs font-medium text-primary">
              Marchează citite
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <div className="px-2 py-6 text-center text-sm text-slate-500">Nu ai notificări.</div>
        )}
        {notifications.slice(0, 8).map((notification) => (
          <DropdownMenuItem
            key={notification.id}
            className="cursor-pointer items-start gap-3 p-3"
            onClick={() => {
              if (notification.url) navigate(notification.url);
            }}
          >
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? 'bg-slate-300' : 'bg-primary'}`} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{notification.title}</span>
              <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-slate-500">{notification.body}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
