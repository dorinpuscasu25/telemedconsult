import { MessageSquare, Stethoscope, Video } from 'lucide-react';
import type { ServiceType } from '../../lib/doctor';

/** Video, chat sau la domiciliu — aceeași iconiță în profil, cerere și catalog. */
export function ServiceIcon({ type, className }: { type: ServiceType; className?: string }) {
  const Icon = type === 'chat' ? MessageSquare : type === 'home' ? Stethoscope : Video;
  return <Icon className={className} />;
}
