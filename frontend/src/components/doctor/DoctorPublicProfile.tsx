import { Building2, Star } from 'lucide-react';
import { cn } from '../ui/utils';
import { investigationsText, mdl, serviceMeta, type DoctorServiceItem } from '../../lib/doctor';
import { ServiceIcon } from './ServiceIcon';

export interface PublicDoctor {
  name: string;
  specialty?: string | null;
  experience_years?: number | null;
  rating?: number | string | null;
  reviews_count?: number | null;
  institution?: { name: string; address?: string | null } | null;
  bio?: string | null;
  services: DoctorServiceItem[];
}

const initialsOf = (name: string) => name.replace(/^Dr\.?\s*/i, '').split(' ').filter(Boolean).map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();
const rating = (value: PublicDoctor['rating']) => Number(value || 0).toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const displayName = (name: string) => (/^dr\.?\s/i.test(name) ? name : `Dr. ${name}`);

/** V1 · antetul profilului public: nume, experiență, rating, instituția și despre. */
export function PublicDoctorHeader({ doctor, compact = false }: { doctor: PublicDoctor; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col rounded-2xl border border-slate-200 bg-white', compact ? 'gap-3.5 p-4' : 'gap-[18px] p-6')}>
      <div className={cn('flex items-center', compact ? 'gap-3.5' : 'gap-[18px]')}>
        <span className={cn('grid shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700', compact ? 'h-[60px] w-[60px] text-[19px]' : 'h-[76px] w-[76px] text-2xl')}>{initialsOf(doctor.name)}</span>
        <div className={cn('flex flex-col', compact ? 'gap-[3px]' : 'gap-1.5')}>
          <span className={cn('font-bold text-slate-950', compact ? 'text-[19px] tracking-[-.01em]' : 'text-2xl tracking-[-.02em]')}>{displayName(doctor.name)}</span>
          <span className={cn('text-slate-600', compact ? 'text-[13px]' : 'text-sm')}>{[doctor.specialty, doctor.experience_years ? `${doctor.experience_years} ani${compact ? '' : ' experiență'}` : null].filter(Boolean).join(' · ')}</span>
          {(doctor.reviews_count ?? 0) > 0 && (
            <span className="flex items-center gap-1.5 text-[13px] text-slate-600"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /><b className="text-slate-950">{rating(doctor.rating)}</b> · {doctor.reviews_count} recenzii</span>
          )}
        </div>
      </div>
      {doctor.institution && (
        <div className={cn('flex items-center gap-3 rounded-xl bg-slate-50', compact ? 'p-3' : 'px-4 py-3.5')}>
          {compact ? <Building2 className="h-5 w-5 shrink-0 text-slate-500" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-600"><Building2 className="h-5 w-5" /></span>}
          <div className="flex min-w-0 flex-col gap-0.5">
            {!compact && <span className="text-xs text-slate-500">Lucrează la</span>}
            <span className={cn('font-semibold text-slate-950', compact ? 'text-sm' : 'text-[15px]')}>{doctor.institution.name}</span>
            {doctor.institution.address && <span className={cn('text-slate-500', compact ? 'text-xs' : 'text-[13px]')}>{doctor.institution.address}</span>}
          </div>
        </div>
      )}
      {!compact && doctor.bio && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{doctor.bio}</p>}
    </div>
  );
}

/** Lista „Alege serviciul”: fiecare serviciu activ cu tip, durată, preț și investigații. */
export function ServiceChoices({ services, selectedId, onSelect, compact = false }: { services: DoctorServiceItem[]; selectedId: string | null; onSelect: (id: string) => void; compact?: boolean }) {
  if (!services.length) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">Medicul nu are servicii active momentan.</p>;
  return (
    <div className="flex flex-col gap-3">
      {services.map((service) => {
        const on = service.id === selectedId;
        return (
          <button key={service.id} type="button" onClick={() => onSelect(service.id)} aria-pressed={on}
            className={cn('flex items-start text-left', compact ? 'gap-3 rounded-[14px] p-3.5' : 'gap-3.5 rounded-[14px] px-[18px] py-4', on ? 'border-[1.5px] border-blue-600 bg-[#F8FBFF] shadow-[0_0_0_3px_rgba(37,99,235,.10)]' : 'border border-slate-200 bg-white hover:border-slate-300')}>
            <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', compact ? 'mt-px' : 'mt-[9px]', on ? 'border-blue-600' : 'border-slate-300')}><span className={cn('h-2.5 w-2.5 rounded-full', on ? 'bg-blue-600' : 'bg-transparent')} /></span>
            {!compact && <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-700"><ServiceIcon type={service.type} className="h-[18px] w-[18px]" /></span>}
            <span className={cn('flex min-w-0 flex-1 flex-col', compact ? 'gap-[3px]' : 'gap-1')}>
              <span className="text-[15px] font-semibold text-slate-950">{service.name}</span>
              <span className="text-[13px] text-slate-500">{serviceMeta(service)}</span>
              {service.type === 'home' && <span className={cn('text-slate-600', compact ? 'text-xs' : 'text-[13px]')}>{investigationsText(service.investigations)}</span>}
            </span>
            <span className={cn('whitespace-nowrap font-bold text-slate-950', compact ? 'text-[15px]' : 'mt-2 text-base')}>{mdl(service.price)}</span>
          </button>
        );
      })}
    </div>
  );
}
