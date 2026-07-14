import React, { useEffect, useState } from 'react';
import { AlertTriangle, MessageSquareWarning, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import { apiRequest } from '../../lib/api';

interface Complaint {
  id: number;
  reportedUser?: string | null;
  consultation_request_id?: number | null;
  date: string;
  status: string;
  subject: string;
  description: string;
  resolution_note?: string | null;
  coupon_code?: string | null;
  coupon_amount?: number | null;
}

interface RequestOption {
  id: string;
  label: string;
  doctor_id?: number | null;
  operator_id?: number | null;
  status: string;
}

interface ReviewableRequest {
  id: string;
  doctor_id: string;
  doctor_name: string;
  specialty?: string | null;
  completed_at?: string | null;
}

export function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [requests, setRequests] = useState<RequestOption[]>([]);
  const [reviewable, setReviewable] = useState<ReviewableRequest[]>([]);
  const [requestId, setRequestId] = useState('none');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [reviewRequestId, setReviewRequestId] = useState('');
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = () => {
    Promise.all([
      apiRequest<{data: Complaint[]; requests: RequestOption[]}>('/patient/complaints'),
      apiRequest<{data: ReviewableRequest[]}>('/patient/reviewable-requests')
    ]).then(([complaintsResponse, reviewsResponse]) => {
      setComplaints(complaintsResponse.data);
      setRequests(complaintsResponse.requests);
      setReviewable(reviewsResponse.data);
      setReviewRequestId((current) => current || reviewsResponse.data[0]?.id || '');
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const submitComplaint = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await apiRequest('/patient/complaints', {
        method: 'POST',
        body: JSON.stringify({
          consultation_request_id: requestId === 'none' ? null : requestId,
          subject,
          description
        })
      });
      setSubject('');
      setDescription('');
      setRequestId('none');
      setMessage('Reclamația a fost trimisă.');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite reclamația.');
    }
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reviewRequestId) return;

    setError('');
    setMessage('');
    try {
      await apiRequest(`/requests/${reviewRequestId}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating: Number(rating), comment })
      });
      setComment('');
      setMessage('Recenzia a fost salvată.');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva recenzia.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reclamații și recenzii</h1>
        <p className="mt-1 text-sm text-slate-500">Trimite reclamații către echipă și evaluează consultațiile finalizate.</p>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareWarning className="h-5 w-5 text-red-500" />
              Reclamație nouă
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submitComplaint}>
              <div className="space-y-2">
                <Label>Consultație asociată</Label>
                <Select value={requestId} onValueChange={setRequestId}>
                  <SelectTrigger className="h-11 rounded-xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără consultație asociată</SelectItem>
                    {requests.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subiect</Label>
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} className="h-11 rounded-xl bg-white" required />
              </div>
              <div className="space-y-2">
                <Label>Descriere</Label>
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-32 rounded-xl bg-white" required />
              </div>
              <Button className="h-11 rounded-xl">Trimite reclamația</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              Lasă o recenzie
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reviewable.length === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-5 text-sm text-slate-500">
                Nu există consultații finalizate neevaluate.
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submitReview}>
                <div className="space-y-2">
                  <Label>Consultație</Label>
                  <Select value={reviewRequestId} onValueChange={setReviewRequestId}>
                    <SelectTrigger className="h-11 rounded-xl bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reviewable.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.doctor_name} {item.specialty ? `- ${item.specialty}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rating</Label>
                  <Select value={rating} onValueChange={setRating}>
                    <SelectTrigger className="h-11 rounded-xl bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 4, 3, 2, 1].map((value) => (
                        <SelectItem key={value} value={String(value)}>{value} stele</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Comentariu</Label>
                  <Textarea value={comment} onChange={(event) => setComment(event.target.value)} className="min-h-24 rounded-xl bg-white" />
                </div>
                <Button className="h-11 rounded-xl">Salvează recenzia</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200/70 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Reclamațiile mele</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {complaints.length === 0 && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-5 text-sm text-slate-500">Nu ai reclamații trimise.</div>
          )}
          {complaints.map((complaint) => (
            <div key={complaint.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-slate-400" />
                    <h3 className="font-semibold text-slate-900">{complaint.subject}</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Reclamat: {complaint.reportedUser || 'Nespecificat'} • {new Date(complaint.date).toLocaleString()}</p>
                </div>
                <Badge variant={complaint.status === 'new' ? 'destructive' : 'secondary'}>{complaint.status === 'new' ? 'Nouă' : 'Rezolvată'}</Badge>
              </div>
              <p className="mt-3 text-sm text-slate-700">{complaint.description}</p>
              {complaint.resolution_note && (
                <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                  {complaint.resolution_note}
                  {complaint.coupon_code && <div className="mt-1 font-semibold">Cupon: {complaint.coupon_code} ({complaint.coupon_amount} MDL)</div>}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
