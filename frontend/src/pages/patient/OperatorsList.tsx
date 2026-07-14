import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Activity, CheckCircle2, MapPin, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiRequest } from '../../lib/api';

interface Operator {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  region?: string | null;
  equipment: string[];
  is_available: boolean;
  exam_price: number;
}

interface PatientProfile {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  identity_number?: string | null;
  region?: string | null;
  locality?: string | null;
  status?: string | null;
  active_until?: string | null;
  can_request_consultation?: boolean;
}

export function OperatorsList() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [patientProfiles, setPatientProfiles] = useState<PatientProfile[]>([]);
  const [patientProfileId, setPatientProfileId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    apiRequest<{data: Operator[]}>('/catalog/operators', { auth: false }).then((response) => setOperators(response.data));
    apiRequest<{patient_profiles: PatientProfile[]}>('/patient/profile')
      .then((response) => {
        const profiles = response.patient_profiles ?? [];
        const requestableProfiles = profiles.filter(canRequestConsultation);
        setPatientProfiles(profiles);
        setPatientProfileId(requestableProfiles[0]?.id ? String(requestableProfiles[0].id) : '');
      })
      .catch(() => undefined);
  }, []);

  const filteredOperators = useMemo(() => operators.filter((operator) => {
    const haystack = `${operator.name} ${operator.region || ''}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  }), [operators, searchTerm]);

  const openDialog = (operator: Operator) => {
    const requestableProfiles = patientProfiles.filter(canRequestConsultation);
    setSelectedOperator(operator);
    setPatientProfileId(requestableProfiles[0]?.id ? String(requestableProfiles[0].id) : '');
    setAddress('');
    setPhone(operator.phone || '');
    setNotes('');
    setScheduledAt('');
    setError('');
    setIsSuccess(false);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setSelectedOperator(null);
    setIsSuccess(false);
    setError('');
  };

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOperator) return;
    if (!patientProfileId) {
      setError('Alege un profil de pacient activ înainte de confirmare.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const response = await apiRequest<{conversation?: { id: number }}>('/requests', {
        method: 'POST',
        body: JSON.stringify({
          type: 'operator',
          operator_id: selectedOperator.id,
          patient_profile_id: Number(patientProfileId),
          scheduled_at: scheduledAt || null,
          symptoms: `Solicitare examinare la domiciliu.\nAdresă: ${address}\nTelefon: ${phone}\nDetalii: ${notes || 'Nespecificat'}`
        })
      });
      if (response.conversation?.id) {
        navigate(`/patient/chat?conversation=${response.conversation.id}`);
        return;
      }
      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite solicitarea.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
          Operatori pentru Examinare
        </h1>
        <p className="text-slate-500">
          Solicită un operator disponibil și creează o conversație reală în sistem.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Caută după nume sau regiune..."
          className="pl-10 bg-white/80 backdrop-blur-sm border-slate-200/60 rounded-xl h-12"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOperators.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3 border-slate-200/70 bg-white shadow-sm">
            <CardContent className="p-8 text-center">
              <h3 className="text-lg font-semibold text-slate-900">Nu există operatori aprobați</h3>
              <p className="mt-2 text-sm text-slate-500">
                Operatorii vor apărea aici după ce sunt adăugați și aprobați din panoul admin.
              </p>
            </CardContent>
          </Card>
        )}
        {filteredOperators.map((operator, index) => (
          <motion.div
            key={operator.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}>
            <Card className="glass-card overflow-hidden border-0 h-full flex flex-col">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-4">
                      <Avatar className="h-14 w-14 border-2 border-white shadow-sm">
                      <AvatarFallback>{operator.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-bold text-lg text-slate-900 leading-tight">{operator.name}</h3>
                      <div className="flex items-center text-sm text-slate-500 mt-1">
                        <MapPin className="h-3 w-3 mr-1" />
                        {operator.region || 'Regiune nesetată'}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4 flex-1 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <Badge
                    variant={operator.is_available ? 'default' : 'secondary'}
                    className={operator.is_available ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}>
                    {operator.is_available ? 'Disponibil' : 'Ocupat'}
                  </Badge>
                  <div className="text-slate-500 flex items-center">
                    <Activity className="h-3 w-3 mr-1" />
                    Echipament
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {operator.equipment.map((item) => (
                    <Badge key={item} variant="secondary" className="text-[10px] bg-slate-100 text-slate-600">
                      {item}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button
                  className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 text-white"
                  onClick={() => openDialog(operator)}
                  disabled={!operator.is_available}>
                  Solicită Examinare ({operator.exam_price} MDL)
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[460px] glass-panel border-0 rounded-2xl z-50">
          {selectedOperator && !isSuccess && (
            <form onSubmit={handleRequest}>
              <DialogHeader>
                <DialogTitle className="text-2xl">Confirmare Solicitare</DialogTitle>
                <DialogDescription>
                  Operatorul se va deplasa la adresa indicată pentru examinare.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-6">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{selectedOperator.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{selectedOperator.name}</p>
                    <p className="text-xs text-slate-500">{selectedOperator.region}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Profil pacient</Label>
                  {patientProfiles.filter(canRequestConsultation).length > 0 ? (
                    <Select value={patientProfileId} onValueChange={setPatientProfileId}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Alege pacientul" /></SelectTrigger>
                      <SelectContent>
                        {patientProfiles.filter(canRequestConsultation).map((profile) => (
                          <SelectItem key={profile.id} value={String(profile.id)}>
                            {patientProfileName(profile)} {profile.region ? `• ${profile.region}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="font-medium text-slate-900">Examinarea este blocată până activezi un pacient.</p>
                      <p className="mt-1">Ca să poți continua, cumpără un pachet din wallet, apoi adaugă profilul pacientului. Fără pachet activ nu se poate crea pacient și fără pacient nu se poate achita examinarea.</p>
                      <Button type="button" variant="outline" className="mt-3 rounded-xl" onClick={() => navigate('/patient/profile')}>
                        Cumpără pachet → adaugă pacient
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Adresa completă</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Strada, bloc, apartament..."
                    className="rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon de contact</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+373 6X XXX XXX"
                    className="rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Detalii pentru operator</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Simptome, etaj, cod interfon, preferințe orar..."
                    className="rounded-xl min-h-[90px] resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operator_scheduled_at">Data și ora preferată</Label>
                  <Input
                    id="operator_scheduled_at"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="rounded-xl"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} className="rounded-xl">
                  Anulare
                </Button>
                <Button type="submit" disabled={isSubmitting || !patientProfileId} className="rounded-xl bg-slate-900 text-white">
                  {isSubmitting ? 'Se trimite...' : `Achită ${selectedOperator.exam_price} MDL`}
                </Button>
              </DialogFooter>
            </form>
          )}

          {selectedOperator && isSuccess && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                <CheckCircle2 className="h-20 w-20 text-green-500" />
              </motion.div>
              <h2 className="text-2xl font-bold text-slate-900">Operator solicitat</h2>
              <p className="text-slate-500">
                Solicitarea a fost salvată și conversația este disponibilă în Chat.
              </p>
              <div className="grid grid-cols-2 gap-3 w-full">
                <Button variant="outline" onClick={closeDialog} className="rounded-xl">
                  Închide
                </Button>
                <Button onClick={() => navigate('/patient/chat')} className="rounded-xl">
                  Deschide Chat
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function patientProfileName(profile: PatientProfile) {
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || `Profil #${profile.id}`;
}

function canRequestConsultation(profile: PatientProfile) {
  if (typeof profile.can_request_consultation === 'boolean') return profile.can_request_consultation;
  if (profile.status && profile.status !== 'active') return false;
  if (profile.active_until && new Date(profile.active_until).getTime() <= Date.now()) return false;

  return Boolean(profile.first_name && profile.last_name && profile.identity_number);
}
