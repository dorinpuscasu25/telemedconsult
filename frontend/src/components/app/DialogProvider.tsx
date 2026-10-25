import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

/**
 * Înlocuiește `window.confirm` / `window.prompt`. Ferestrele native nu pot fi
 * stilizate, nu explică urmările (de ex. refund-ul) și cereau date în format
 * text („YYYY-MM-DD HH:mm”). API-ul rămâne la fel de simplu: un `await`.
 */

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
};

export type FormField = {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'datetime-local' | 'number';
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
  min?: string;
};

type FormOptions = ConfirmOptions & { fields: FormField[] };

type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'form'; options: FormOptions; resolve: (value: Record<string, string> | null) => void };

type DialogApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  form: (options: FormOptions) => Promise<Record<string, string> | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useDialogs trebuie folosit în interiorul DialogProvider.');
  return context;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const settled = useRef(false);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    settled.current = false;
    setPending({ kind: 'confirm', options, resolve });
  }), []);

  const form = useCallback((options: FormOptions) => new Promise<Record<string, string> | null>((resolve) => {
    settled.current = false;
    setValues(Object.fromEntries(options.fields.map((field) => [field.name, field.defaultValue ?? ''])));
    setPending({ kind: 'form', options, resolve });
  }), []);

  const close = (accepted: boolean) => {
    if (!pending || settled.current) return;
    settled.current = true;
    if (pending.kind === 'confirm') pending.resolve(accepted);
    else pending.resolve(accepted ? values : null);
    setPending(null);
  };

  const options = pending?.options;
  const danger = options?.tone === 'danger';
  const missingRequired = pending?.kind === 'form' && pending.options.fields.some((field) => field.required && !(values[field.name] ?? '').trim());

  return (
    <DialogContext.Provider value={{ confirm, form }}>
      {children}
      <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) close(false); }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(event) => { event.preventDefault(); if (!missingRequired) close(true); }} className="grid gap-5">
            <DialogHeader>
              <div className="flex items-start gap-3">
                {danger && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><AlertTriangle className="h-5 w-5" /></span>}
                <div className="space-y-1.5">
                  <DialogTitle>{options?.title}</DialogTitle>
                  {options?.description && <DialogDescription asChild><div>{options.description}</div></DialogDescription>}
                </div>
              </div>
            </DialogHeader>
            {pending?.kind === 'form' && (
              <div className="grid gap-4">
                {pending.options.fields.map((field, index) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={`dialog-field-${field.name}`}>{field.label}{!field.required && <span className="ml-1 font-normal text-slate-400">(opțional)</span>}</Label>
                    {field.type === 'textarea' ? (
                      <Textarea id={`dialog-field-${field.name}`} autoFocus={index === 0} value={values[field.name] ?? ''} placeholder={field.placeholder} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
                    ) : (
                      <Input id={`dialog-field-${field.name}`} autoFocus={index === 0} type={field.type ?? 'text'} min={field.min} value={values[field.name] ?? ''} placeholder={field.placeholder} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
                    )}
                    {field.hint && <p className="text-xs text-slate-500">{field.hint}</p>}
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>{options?.cancelLabel ?? 'Renunță'}</Button>
              <Button type="submit" disabled={missingRequired} className={danger ? 'bg-red-600 text-white hover:bg-red-700' : undefined}>
                {options?.confirmLabel ?? 'Confirmă'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DialogContext.Provider>
  );
}
