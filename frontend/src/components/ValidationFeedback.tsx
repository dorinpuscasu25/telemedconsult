import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { controlLabel, fieldLabel, findControl, nativeValidationMessage, VALIDATION_CLEAR_EVENT, VALIDATION_EVENT, type ValidationDetail } from '../lib/validation';

type Entry = { key: string; label: string; messages: string[]; control: HTMLElement | null; host: HTMLElement | null; previousInvalid: string | null; previousDescription: string | null };
type Feedback = { entries: Entry[]; summary: HTMLElement; scope: HTMLElement | null };

export function ValidationFeedback() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const location = useLocation();
  useEffect(() => {
    let current: Feedback | null = null;
    let frame = 0;
    const removeEntry = (entry: Entry) => {
      entry.host?.remove();
      if (!entry.control) return;
      for (const [key, value] of [['aria-invalid', entry.previousInvalid], ['aria-describedby', entry.previousDescription]] as const) {
        if (value === null) entry.control.removeAttribute(key); else entry.control.setAttribute(key, value);
      }
    };
    const clear = () => {
      current?.entries.forEach(removeEntry); current?.summary.remove(); current = null; setFeedback(null);
    };
    const show = (detail: ValidationDetail) => {
      if (detail.path !== window.location.pathname + window.location.search) return;
      if (detail.scope && !detail.scope.isConnected) return;
      clear();
      const scope = detail.scope || document.querySelector<HTMLElement>('[role="dialog"]') || document.querySelector<HTMLElement>('main') || document.body;
      const entries = Object.entries(detail.errors).map(([key, messages], index) => {
        const control = findControl(scope, key);
        const host = control ? document.createElement('div') : null;
        const entry: Entry = { key, label: control ? controlLabel(control) || fieldLabel(key) : fieldLabel(key), messages, control, host, previousInvalid: control?.getAttribute('aria-invalid') ?? null, previousDescription: control?.getAttribute('aria-describedby') ?? null };
        if (host && control) {
          host.id = `validation-feedback-${index}`; host.dataset.validationFeedback = 'field';
          control.insertAdjacentElement('afterend', host);
          control.setAttribute('aria-invalid', 'true');
          control.setAttribute('aria-describedby', [entry.previousDescription, host.id].filter(Boolean).join(' '));
        }
        return entry;
      });
      if (!entries.length) return;
      const summary = document.createElement('div'); summary.dataset.validationFeedback = 'summary'; summary.className = 'col-span-full';
      // Portal hosts sit beside controls; form values remain owned by React.
      scope.prepend(summary);
      current = { entries, summary, scope: detail.scope }; setFeedback(current);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const first = entries.find((entry) => entry.control)?.control;
        if (first?.isConnected) { first.focus({ preventScroll: true }); first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        else summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    };
    const onValidation = (event: Event) => show((event as CustomEvent<ValidationDetail>).detail);
    const onSuccess = (event: Event) => { const scope = (event as CustomEvent<{ scope: HTMLElement | null }>).detail.scope; if (scope && current && current.scope === scope) clear(); };
    const onInput = (event: Event) => {
      if (!current) return;
      const changed = current.entries.filter((entry) => entry.control === event.target);
      if (!changed.length) return;
      changed.forEach(removeEntry);
      const entries = current.entries.filter((entry) => entry.control !== event.target);
      if (!entries.length) clear(); else { current = { ...current, entries }; setFeedback(current); }
    };
    let nativeQueued = false;
    const onInvalid = (event: Event) => {
      const control = event.target as HTMLInputElement;
      const form = control.form;
      if (!form) return;
      event.preventDefault();
      if (nativeQueued) return;
      nativeQueued = true;
      queueMicrotask(() => {
        nativeQueued = false;
        if (!form.isConnected) return;
        const errors: Record<string, string[]> = {};
        form.querySelectorAll<HTMLInputElement>('input:invalid,textarea:invalid,select:invalid').forEach((field, index) => {
          const key = field.name || field.id || `native-${index}`;
          if (!field.name && !field.id) field.dataset.field = key;
          errors[key] = [nativeValidationMessage(field)];
        });
        show({ errors, scope: form, path: window.location.pathname + window.location.search });
      });
    };
    window.addEventListener(VALIDATION_EVENT, onValidation);
    window.addEventListener(VALIDATION_CLEAR_EVENT, onSuccess);
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onInput, true);
    document.addEventListener('invalid', onInvalid, true);
    return () => {
      window.cancelAnimationFrame(frame); clear();
      window.removeEventListener(VALIDATION_EVENT, onValidation); window.removeEventListener(VALIDATION_CLEAR_EVENT, onSuccess);
      document.removeEventListener('input', onInput, true); document.removeEventListener('change', onInput, true); document.removeEventListener('invalid', onInvalid, true);
    };
  }, [location.pathname, location.search]);
  if (!feedback) return null;
  return <>
    {createPortal(<div role="alert" className="col-span-full mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4 shrink-0" />Verifică datele completate</p><p className="mt-1">Corectează câmpurile de mai jos, apoi încearcă din nou.</p><ul className="mt-2 list-inside list-disc space-y-1">{feedback.entries.map((entry) => <li key={entry.key}>{entry.control ? <button type="button" className="text-left underline underline-offset-2" onClick={() => { entry.control?.focus(); entry.control?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{entry.messages.join(' ')}</button> : <span>{entry.messages.join(' ')}</span>}</li>)}</ul></div>, feedback.summary)}
    {feedback.entries.map((entry) => entry.host && createPortal(<p className="mt-1.5 text-sm font-medium text-red-700">{entry.messages.join(' ')}</p>, entry.host, entry.key))}
  </>;
}
