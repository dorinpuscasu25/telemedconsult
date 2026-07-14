import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquareWarning, Ticket } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';

interface Complaint {
  id: number;
  patient: string;
  reportedUser: string;
  date: string;
  status: 'new' | 'resolved' | string;
  subject: string;
  description: string;
  resolution_note?: string | null;
  coupon_code?: string | null;
  coupon_amount?: number | null;
}

export function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [couponAmount, setCouponAmount] = useState('100');

  const loadComplaints = () => {
    apiRequest<{data: Complaint[]}>('/admin/complaints').then((response) => setComplaints(response.data));
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const openResolve = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setResolutionNote(complaint.resolution_note || '');
    setCouponAmount(complaint.coupon_amount ? String(complaint.coupon_amount) : '100');
    setIsResolveOpen(true);
  };

  const resolveComplaint = async (withCoupon: boolean) => {
    if (!selectedComplaint) return;

    await apiRequest(`/admin/complaints/${selectedComplaint.id}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({
        resolution_note: resolutionNote || 'Reclamație analizată și închisă de administrator.',
        coupon_amount: withCoupon ? Number(couponAmount) : null
      })
    });
    setIsResolveOpen(false);
    loadComplaints();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Reclamații</h1>
        <p className="text-slate-500">Date reale din baza de date, cu rezolvare persistentă.</p>
      </div>

      <div className="grid gap-4">
        {complaints.map((complaint, index) => (
          <motion.div key={complaint.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <Card className={`glass-card border-l-4 border-y-0 border-r-0 ${complaint.status === 'new' ? 'border-l-red-500' : 'border-l-slate-300 opacity-75'}`}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-lg text-slate-900">De la: {complaint.patient}</h3>
                      {complaint.status === 'new' ? (
                        <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100">Nou</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600">Rezolvat</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      Reclamat: {complaint.reportedUser || 'Nespecificat'} • {new Date(complaint.date).toLocaleString()}
                    </p>
                    <p className="text-sm font-medium text-slate-800 mt-2">{complaint.subject}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
                  <p className="text-slate-700 text-sm">{complaint.description}</p>
                </div>

                {complaint.status !== 'new' && (
                  <div className="bg-green-50 p-4 rounded-xl border border-green-100 mb-4 text-sm text-green-800">
                    <p>{complaint.resolution_note}</p>
                    {complaint.coupon_code && <p className="font-semibold mt-2">Cupon: {complaint.coupon_code} ({complaint.coupon_amount} MDL)</p>}
                  </div>
                )}

                {complaint.status === 'new' && (
                  <div className="flex gap-2">
                    <Button className="rounded-xl bg-slate-900 text-white" onClick={() => openResolve(complaint)}>
                      <MessageSquareWarning className="w-4 h-4 mr-2" /> Răspunde Oficial
                    </Button>
                    <Button variant="outline" className="rounded-xl border-primary text-primary hover:bg-primary/5" onClick={() => openResolve(complaint)}>
                      <Ticket className="w-4 h-4 mr-2" /> Oferă Cupon
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={isResolveOpen} onOpenChange={setIsResolveOpen}>
        <DialogContent className="sm:max-w-[520px] glass-panel border-0 rounded-2xl z-50">
          <DialogHeader>
            <DialogTitle className="text-2xl">Rezolvare reclamație</DialogTitle>
            <DialogDescription>Salvează răspunsul oficial și opțional un cupon de reducere.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Răspuns oficial</Label>
              <Textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} className="rounded-xl min-h-[120px]" />
            </div>
            <div className="space-y-2">
              <Label>Valoare cupon (MDL)</Label>
              <Input type="number" value={couponAmount} onChange={(event) => setCouponAmount(event.target.value)} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setIsResolveOpen(false)}>Anulare</Button>
            <Button variant="outline" className="rounded-xl" onClick={() => resolveComplaint(false)}>Închide fără cupon</Button>
            <Button className="rounded-xl bg-slate-900 text-white" onClick={() => resolveComplaint(true)}>Închide cu cupon</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
