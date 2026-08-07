import React from 'react';

type Props = {
  children: React.ReactNode;
  /** Etichetă folosită în log pentru a identifica zona care a crăpat. */
  label?: string;
  /** Randare compactă, pentru boundary-uri montate în interiorul unui layout. */
  inline?: boolean;
};

type State = {
  error: Error | null;
};

const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

/**
 * Fără acest boundary, orice excepție aruncată la render demontează întreg
 * arborele React și utilizatorul vede o pagină complet albă, fără nicio
 * indicație despre ce s-a întâmplat.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    // Reîncărcare fără cache, pentru cazul în care bundle-ul din cache
    // referă chunk-uri care nu mai există după un deploy.
    window.location.reload();
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    const details = isDev ? `${error.name}: ${error.message}` : null;

    if (this.props.inline) {
      return (
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="text-lg font-bold text-red-900">Secțiunea nu a putut fi afișată</h2>
          <p className="mt-2 text-sm leading-6 text-red-700">
            A apărut o eroare neașteptată. Restul aplicației funcționează normal.
          </p>
          {details && <pre className="mt-3 overflow-auto rounded-lg bg-white/70 p-3 text-left text-xs text-red-800">{details}</pre>}
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700">
              Încearcă din nou
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50">
              Reîncarcă pagina
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">Ceva nu a funcționat</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Aplicația a întâmpinat o eroare neașteptată. Reîncarcă pagina; dacă problema persistă, contactează suportul.
          </p>
          {details && <pre className="mt-4 overflow-auto rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-700">{details}</pre>}
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={this.reload}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
              Reîncarcă pagina
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Înapoi la început
            </button>
          </div>
        </div>
      </div>
    );
  }
}
