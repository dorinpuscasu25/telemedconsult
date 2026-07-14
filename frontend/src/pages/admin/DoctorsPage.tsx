import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Stethoscope } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table';
import { apiRequest } from '../../lib/api';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  status: string;
  profiles?: {
    doctor?: {
      specialty?: { name: string } | null;
      specialty_id?: number;
      consultation_price?: number;
      license_number?: string;
      experience_years?: number;
      is_approved?: boolean;
    } | null;
  };
}

export function DoctorsPage() {
  const [doctors, setDoctors] = useState<AdminUser[]>([]);

  const loadDoctors = () => {
    apiRequest<{data: AdminUser[]}>('/admin/users?role=doctor').then((response) => setDoctors(response.data));
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  const approveDoctor = async (doctor: AdminUser) => {
    await apiRequest(`/admin/users/${doctor.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        roles: ['doctor'],
        is_approved: true
      })
    });
    loadDoctors();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
          Medici
        </h1>
        <p className="text-slate-500">
          Verifică profilurile medicale și aprobă accesul doctorilor în platformă.
        </p>
      </div>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" /> Medici pe platformă
            </span>
            <Button variant="outline" size="sm" onClick={loadDoctors}>
              <RefreshCw className="h-4 w-4 mr-2" /> Reîncarcă
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-slate-200/50 bg-white/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medic</TableHead>
                  <TableHead>Specializare</TableHead>
                  <TableHead>Licență</TableHead>
                  <TableHead>Preț</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doctors.map((doctor) => {
                  const profile = doctor.profiles?.doctor;
                  return (
                    <TableRow key={doctor.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{doctor.name}</div>
                        <div className="text-sm text-slate-500">{doctor.email}</div>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {profile?.specialty?.name || 'Nesetat'}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {profile?.license_number || 'Nesetat'}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {profile?.consultation_price ?? 0} MDL
                      </TableCell>
                      <TableCell>
                        {profile?.is_approved ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Aprobat
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            În așteptare
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!profile?.is_approved && (
                          <Button variant="outline" size="sm" onClick={() => approveDoctor(doctor)}>
                            <CheckCircle2 className="h-4 w-4 mr-2" /> Aprobă
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
