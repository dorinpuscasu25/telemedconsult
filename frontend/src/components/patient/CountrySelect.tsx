import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';

type Country = { code: string; name: string };

export function CountrySelect({ value, onChange, className, label }: { value: string; onChange: (code: string, name: string) => void; className?: string; label?: string }) {
  const [countries, setCountries] = useState<Country[]>([{ code: 'MD', name: 'Republica Moldova' }]);
  const [error, setError] = useState('');
  const load = () => apiRequest<{ data: Country[] }>('/catalog/countries', { auth: false })
    .then((response) => { setCountries(response.data.sort((a, b) => a.name.localeCompare(b.name, 'ro'))); setError(''); })
    .catch(() => setError('Lista țărilor nu a putut fi încărcată.'));
  useEffect(() => { void load(); }, []);
  return <div className="flex flex-col gap-1">
    <select aria-label="Țara de trai" required value={value} onChange={(event) => { const country = countries.find((item) => item.code === event.target.value); if (country) onChange(country.code, country.name); }} className={className}>
      {!countries.some((item) => item.code === value) && <option value={value}>{label || 'Alege țara'}</option>}
      {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
    </select>
    {error && <p role="alert" className="text-xs text-red-700">{error} <button type="button" onClick={() => void load()} className="underline">Reîncearcă</button></p>}
  </div>;
}
