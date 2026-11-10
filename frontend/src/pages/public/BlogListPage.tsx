import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { apiRequest } from '../../lib/api';
import { useSiteContent } from '../../contexts/SiteContentContext';
import { Cover, longDate } from './HomePage';

type BlogListItem = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  category?: string | null;
  cover_image_url: string | null;
  published_at: string | null;
};

/**
 * N1/N3: ultimul articol mare, restul în grilă; categoriile filtrează lista.
 * `basePath` permite aceeași listă și în aplicație (ex. /patient/noutati).
 */
export function BlogListPage({ basePath = '/noutati' }: { basePath?: string } = {}) {
  const { text } = useSiteContent();
  const [posts, setPosts] = useState<BlogListItem[] | null>(null);
  const [category, setCategory] = useState('Toate');
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Noutăți · telemedconsult.md';
    apiRequest<{ data: BlogListItem[] }>('/catalog/blog', { auth: false })
      .then((response) => setPosts(response.data ?? []))
      .catch((err) => { setPosts([]); setError(err instanceof Error ? err.message : 'Nu am putut încărca articolele.'); });
  }, []);

  const categories = useMemo(() => ['Toate', ...new Set((posts ?? []).map((post) => post.category).filter((value): value is string => Boolean(value)))], [posts]);
  const shown = (posts ?? []).filter((post) => category === 'Toate' || post.category === category);
  const [featured, ...rest] = shown;
  const meta = (post: BlogListItem) => <>{post.category && <><b className="font-semibold text-blue-600">{post.category}</b> · </>}{longDate(post.published_at)}</>;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-3.5 px-4 pb-16 pt-5 md:gap-7 md:px-10 md:pb-20 md:pt-12">
      <div className="flex flex-col gap-3.5 md:flex-row md:items-end md:justify-between md:gap-6">
        <h1 className="px-1 text-[30px] font-bold tracking-[-.02em] md:px-0 md:text-[40px] md:tracking-[-.03em]">{text('news.title')}</h1>
        {categories.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
            {categories.map((item) => (
              <button key={item} type="button" onClick={() => setCategory(item)}
                className={cn('h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold md:px-3.5 md:text-sm', category === item ? 'border border-slate-900 bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700')}>{item}</button>
            ))}
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {posts === null && <div className="h-72 animate-pulse rounded-[20px] bg-white" />}
      {posts !== null && !shown.length && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 md:p-12 md:text-[15px]">{posts.length ? 'Nicio noutate în această categorie.' : text('news.empty')}</div>}

      {featured && (
        <Link to={`${basePath}/${featured.slug}`} className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-slate-300 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:rounded-[20px]">
          <Cover url={featured.cover_image_url} className="md:aspect-auto md:h-full md:min-h-[340px]" />
          <div className="flex flex-col justify-center gap-1.5 p-4 md:gap-3.5 md:p-10">
            <span className="text-xs text-slate-500 md:text-[13px]">{meta(featured)}</span>
            <span className="text-[19px] font-bold leading-[1.25] tracking-[-.01em] md:text-[30px] md:leading-[1.15] md:tracking-[-.02em] md:[text-wrap:balance]">{featured.title}</span>
            {featured.excerpt && <span className="text-sm leading-normal text-slate-600 md:text-base md:leading-[1.6]">{featured.excerpt}</span>}
            <span className="mt-1.5 hidden items-center gap-1.5 text-[15px] font-semibold text-blue-600 md:flex">{text('news.read_more')}<ArrowRight className="h-4 w-4" /></span>
          </div>
        </Link>
      )}

      {rest.length > 0 && (
        <div className="flex flex-col gap-3.5 md:grid md:grid-cols-3 md:gap-5">
          {rest.map((post) => (
            <Link key={post.id} to={`${basePath}/${post.slug}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 hover:border-slate-300 md:flex-col md:items-stretch md:gap-0 md:overflow-hidden md:p-0">
              {post.cover_image_url
                ? <img src={post.cover_image_url} alt="" className="h-[72px] w-[72px] shrink-0 rounded-[10px] object-cover md:aspect-video md:h-auto md:w-full md:rounded-none" />
                : <span className="h-[72px] w-[72px] shrink-0 rounded-[10px] bg-slate-100 md:aspect-video md:h-auto md:w-full md:rounded-none" />}
              <div className="flex min-w-0 flex-col gap-1 md:gap-2 md:px-5 md:pb-[22px] md:pt-[18px]">
                <span className="text-xs text-slate-500">{meta(post)}</span>
                <span className="text-[15px] font-semibold leading-[1.3] md:text-[17px] md:leading-[1.35]">{post.title}</span>
                {post.excerpt && <span className="hidden text-sm leading-[1.55] text-slate-600 md:block">{post.excerpt}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
