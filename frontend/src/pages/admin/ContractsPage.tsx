import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bold, Download, Edit, FileText, Italic, Plus, Underline } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';

interface Contract {
  id: number;
  title: string;
  type: string;
  content: string;
  status: string;
  lastUpdated: string;
}

export function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState('general');

  const loadContracts = () => {
    apiRequest<{data: Contract[]}>('/admin/contracts').then((response) => setContracts(response.data));
  };

  useEffect(() => {
    loadContracts();
  }, []);

  const openEdit = (contract: Contract) => {
    setSelectedContract(contract);
    setEditTitle(contract.title);
    setEditContent(contract.content);
    setEditType(contract.type);
    setIsEditModalOpen(true);
  };

  const openNew = () => {
    setSelectedContract(null);
    setEditTitle('');
    setEditContent('');
    setEditType('general');
    setIsEditModalOpen(true);
  };

  const saveContract = async () => {
    const payload = {
      title: editTitle,
      type: editType || 'general',
      content: editContent,
      status: 'active'
    };

    if (selectedContract) {
      await apiRequest(`/admin/contracts/${selectedContract.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await apiRequest('/admin/contracts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    setIsEditModalOpen(false);
    loadContracts();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Contracte și Documente</h1>
          <p className="text-slate-500">Șabloane reale persistate în backend.</p>
        </div>
        <Button className="rounded-xl bg-slate-900 text-white" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Contract Nou
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {contracts.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3 border-slate-200/70 bg-white shadow-sm">
            <CardContent className="p-8 text-center">
              <h3 className="text-lg font-semibold text-slate-900">Nu există contracte încă</h3>
              <p className="mt-2 text-sm text-slate-500">
                Adaugă contractele reale primite de la jurist sau de la client.
              </p>
              <Button className="mt-5 rounded-xl bg-slate-900 text-white" onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" /> Contract Nou
              </Button>
            </CardContent>
          </Card>
        )}
        {contracts.map((contract, index) => (
          <motion.div key={contract.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <Card className="glass-card border-0 h-full flex flex-col">
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg leading-tight">{contract.title}</CardTitle>
                    <CardDescription>Actualizat: {new Date(contract.lastUpdated).toLocaleString()}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <p className="text-sm text-slate-500 line-clamp-3 mb-6">{contract.content}</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl text-primary border-primary/20 hover:bg-primary/5" onClick={() => openEdit(contract)}>
                    <Edit className="h-4 w-4 mr-2" /> Editează
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl text-slate-400"
                    onClick={() => {
                      const blob = new Blob([contract.content], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `${contract.title}.txt`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[800px] glass-panel border-0 rounded-2xl z-50 max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl">{selectedContract ? 'Editează Contractul' : 'Contract Nou'}</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="grid gap-4 md:grid-cols-[1fr_180px] shrink-0">
              <div className="space-y-2">
                <Label>Titlu Document</Label>
                <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="Ex: Contract Prestări Servicii" className="rounded-xl font-medium" />
              </div>
              <div className="space-y-2">
                <Label>Tip</Label>
                <Input value={editType} onChange={(event) => setEditType(event.target.value)} placeholder="doctor/operator/patient" className="rounded-xl" />
              </div>
            </div>

            <div className="space-y-2 flex-1 flex flex-col min-h-[300px]">
              <Label>Conținut</Label>
              <div className="flex items-center gap-1 p-1 border border-b-0 border-slate-200 rounded-t-xl bg-slate-50">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"><Bold className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"><Italic className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"><Underline className="h-4 w-4" /></Button>
              </div>
              <Textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} className="flex-1 rounded-b-xl rounded-t-none resize-none p-4" />
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-4">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)} className="rounded-xl">Anulare</Button>
            <Button onClick={saveContract} className="rounded-xl bg-slate-900 text-white" disabled={!editTitle || !editContent}>Salvează Documentul</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
