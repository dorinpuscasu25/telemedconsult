import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

type Conversation = { patient_profile_id?: number; patient_profile?: { display_name?: string; patient_code?: string }; unread_count?: number };
export function ChatPatientMenu({ active = false, compact = false }: { active?: boolean; compact?: boolean }) {
  const { role } = useAuth();
  const [patients, setPatients] = useState<Array<{ id: number; name: string; code?: string; unread: number }>>([]);
  const [error, setError] = useState('');
  const load = async (open: boolean) => {
    if (!open) return;
    setError('');
    try {
      const response = await apiRequest<{ data: Conversation[] }>('/conversations');
      const groups = new Map<number, { id: number; name: string; code?: string; unread: number }>();
      response.data.forEach((item) => {
        if (!item.patient_profile_id) return;
        const current = groups.get(item.patient_profile_id) || { id: item.patient_profile_id, name: item.patient_profile?.display_name || 'Pacient', code: item.patient_profile?.patient_code, unread: 0 };
        current.unread += item.unread_count || 0; groups.set(current.id, current);
      });
      setPatients([...groups.values()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Lista nu a putut fi încărcată.'); }
  };
  const triggerClassName = `inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm font-medium ${active ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`;
  if (role !== 'patient') return <Link to={`/${role}/chat`} className={triggerClassName}>{!compact && <MessageSquare className="h-4 w-4" />}Chat</Link>;
  return <DropdownMenu onOpenChange={load}><DropdownMenuTrigger className={triggerClassName}>
    {!compact && <MessageSquare className="h-4 w-4" />}Chat<ChevronDown className="h-3 w-3" />
  </DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-80 min-w-64 overflow-auto">
    <DropdownMenuItem asChild><Link to={`/${role}/chat`}>Toate conversațiile</Link></DropdownMenuItem>
    {patients.map((patient) => <DropdownMenuItem key={patient.id} asChild><Link to={`/${role}/chat?patient_profile=${patient.id}`} className="flex justify-between gap-3"><span>{patient.name} · {patient.code}</span>{patient.unread > 0 && <span className="rounded-full bg-blue-600 px-2 text-xs text-white">{patient.unread}</span>}</Link></DropdownMenuItem>)}
    {error && <p role="alert" className="p-2 text-sm text-red-600">{error}</p>}
    {!patients.length && !error && <p className="p-2 text-sm text-slate-500">Conversațiile apar după solicitarea unei consultații.</p>}
  </DropdownMenuContent></DropdownMenu>;
}
