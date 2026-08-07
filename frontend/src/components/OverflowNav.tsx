import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu';

export interface OverflowNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

interface OverflowNavProps {
  items: OverflowNavItem[];
  isActive: (path: string) => boolean;
  onNavigate: (path: string) => void;
  className?: string;
}

/** Distanța dintre intrări (gap-1 din Tailwind), necesară la calculul lățimii. */
const GAP = 4;

/**
 * Bara de navigație care arată TOT ce încape.
 *
 * Înainte, împărțirea era fixă în cod: patru intrări rămâneau mereu vizibile,
 * restul mereu în „Mai multe” — și pe un ecran lat, unde ar fi încăput toate.
 *
 * Acum lățimile se măsoară la fiecare redimensionare și se coboară în trepte,
 * ca ascunderea unei secțiuni să fie ultima soluție, nu prima:
 *
 *   1. tot meniul, cu iconițe;
 *   2. tot meniul, compact (fără iconițe) — încape cu ~200px mai puțin;
 *   3. abia atunci, „Mai multe” cu ce n-a intrat.
 *
 * Măsurarea se face pe copii invizibile ale intrărilor, la dimensiunea lor
 * reală: dacă am măsura chiar intrările afișate, cele ascunse ar avea lățime
 * zero și calculul s-ar bloca la prima potrivire.
 */
export function OverflowNav({ items, isActive, onNavigate, className = '' }: OverflowNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullMirrorRef = useRef<HTMLDivElement>(null);
  const compactMirrorRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ count: items.length, compact: false });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const fullMirror = fullMirrorRef.current;
    const compactMirror = compactMirrorRef.current;

    if (!container || !fullMirror || !compactMirror) return;

    /** Lățimile intrărilor + a butonului „Mai multe” (ultimul copil). */
    const widthsOf = (mirror: HTMLElement) => {
      const children = Array.from(mirror.children) as HTMLElement[];

      return {
        items: children.slice(0, -1).map((child) => child.offsetWidth),
        more: children[children.length - 1]?.offsetWidth ?? 0
      };
    };

    const measure = () => {
      const available = container.clientWidth;
      const full = widthsOf(fullMirror);
      const compact = widthsOf(compactMirror);
      const total = (widths: number[]) =>
        widths.reduce((sum, width, index) => sum + width + (index ? GAP : 0), 0);

      if (total(full.items) <= available) {
        setLayout({ count: full.items.length, compact: false });

        return;
      }

      if (total(compact.items) <= available) {
        setLayout({ count: compact.items.length, compact: true });

        return;
      }

      // Nici compact nu încape tot: rezervăm locul butonului (plus distanța
      // dintre el și ultima intrare) și punem cât intră.
      let used = compact.more + GAP;
      let count = 0;

      for (const width of compact.items) {
        const next = used + width + (count ? GAP : 0);

        if (next > available) break;

        used = next;
        count++;
      }

      setLayout({ count, compact: true });
    };

    measure();

    // Lățimea disponibilă se schimbă din două motive, iar `ResizeObserver` nu
    // e garantat peste tot (lipsește în unele webview-uri), deci nu ne bazăm
    // doar pe el:
    //   - fereastra se redimensionează → evenimentul `resize`;
    //   - blocul din dreapta crește după ce se încarcă numele utilizatorului,
    //     fără nicio redimensionare → a doua măsurătoare, întârziată.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(container);

    window.addEventListener('resize', measure);

    const frame = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 400);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
    // Etichetele vin din textele de site, încărcate asincron: la schimbarea lor
    // lățimile se schimbă, deci măsurăm din nou.
  }, [items.map((item) => item.label).join('|')]);

  const visible = items.slice(0, layout.count);
  const hidden = items.slice(layout.count);

  return (
    <div ref={containerRef} className={`relative min-w-0 flex-1 ${className}`}>
      <nav className="flex items-center gap-1" aria-label="Navigație principală">
        {visible.map((item) => (
          <NavLink key={item.path} item={item} active={isActive(item.path)} compact={layout.compact} />
        ))}

        {hidden.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                hidden.some((item) => isActive(item.path))
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
              }`}>
              <MoreHorizontal className="h-4 w-4" />
              Mai multe
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {hidden.map((item) => (
                <DropdownMenuItem
                  key={item.path}
                  className="cursor-pointer gap-3 px-3 py-2.5"
                  onClick={() => onNavigate(item.path)}>
                  <item.icon className="h-4 w-4 text-slate-400" />
                  <span>{item.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>

      {/* Copiile de măsurat: în afara fluxului, invizibile, dar cu dimensiunile
          reale ale intrărilor în fiecare dintre cele două densități. */}
      <div
        ref={fullMirrorRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-1">
        {mirrorContent(items, false)}
      </div>
      <div
        ref={compactMirrorRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-1">
        {mirrorContent(items, true)}
      </div>
    </div>
  );
}

/**
 * Intrările la dimensiunea lor reală, plus butonul „Mai multe” la final.
 *
 * Sunt exact aceleași elemente ca în bara vizibilă (`Link`, nu `span`): un alt
 * tip de element se măsura cu câțiva pixeli mai îngust, iar diferența, înmulțită
 * cu numărul de intrări, făcea ca ultima intrare să nu mai încapă.
 */
function mirrorContent(items: OverflowNavItem[], compact: boolean) {
  return (
    <>
      {items.map((item) => (
        <NavLink key={item.path} item={item} active={false} compact={compact} />
      ))}
      <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm font-medium">
        <MoreHorizontal className="h-4 w-4" />
        Mai multe
        <ChevronDown className="h-3.5 w-3.5" />
      </span>
    </>
  );
}

function NavLink({
  item,
  active,
  compact,
  as
}: {
  item: OverflowNavItem;
  active: boolean;
  compact: boolean;
  as?: 'span';
}) {
  const className = `inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 ${
    compact ? 'px-2' : 'px-2.5'
  } ${
    active
      ? 'bg-primary text-white shadow-md shadow-primary/20'
      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
  }`;

  const content = (
    <>
      {!compact && <item.icon className={`mr-2 h-4 w-4 ${active ? 'text-white' : 'text-slate-400'}`} />}
      {item.label}
    </>
  );

  if (as === 'span') {
    return <span className={className}>{content}</span>;
  }

  return (
    <Link to={item.path} className={className}>
      {content}
    </Link>
  );
}
