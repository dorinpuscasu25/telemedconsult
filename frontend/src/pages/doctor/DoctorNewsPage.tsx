import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { apiRequest } from '../../lib/api';
import { markNewsSeen, newsSeenAt } from '../../lib/use-shell-counts';
import { usePageTitle } from '../../lib/use-page-title';

interface Post { id: number; title: string; slug: string; excerpt: string | null; category?: string | null; published_at: string | null }

const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** X1b: anunțurile platformei; cele necitite au un punct albastru. */
export function DoctorNewsPage() {
  usePageTitle('Noutăți');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [seenAt] = useState(newsSeenAt);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ data: Post[] }>('/catalog/blog', { auth: false })
      .then((response) => { setPosts(response.data ?? []); markNewsSeen(); })
      .catch((err) => { setPosts([]); setError(err instanceof Error ? err.message : 'Nu am putut încărca noutățile.'); });
  }, []);

  return (
    <div className="flex max-w-[800px] flex-col gap-4">
      <div className="mb-1 flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold tracking-[-.02em] text-slate-950">Noutăți</h1>
        <span className="text-sm text-slate-500">Anunțuri de la platformă pentru medici.</span>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {posts === null ? [0, 1, 2].map((key) => <Skeleton key={key} className="h-24 w-full rounded-2xl" />) : posts.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">Niciun anunț deocamdată.</p>
      ) : posts.map((post) => {
        const date = post.published_at ? new Date(post.published_at) : null;
        const unread = Boolean(date && date.getTime() > seenAt);
        return (
          <Link key={post.id} to={`/doctor/noutati/${post.slug}`} className="flex gap-3.5 rounded-2xl border border-slate-200 bg-white px-5 py-[18px] hover:border-slate-300">
            <span className={cn('mt-[7px] h-2 w-2 shrink-0 rounded-full', unread ? 'bg-blue-600' : 'bg-transparent')} />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="flex items-center gap-2.5">
                {post.category && <span className="rounded-full bg-slate-100 px-[9px] py-[3px] text-xs font-semibold text-slate-600">{post.category}</span>}
                {date && <span className="text-xs text-slate-400">{date.getDate()} {MONTHS[date.getMonth()]}</span>}
              </span>
              <span className={cn('text-base text-slate-950', unread ? 'font-semibold' : 'font-medium')}>{post.title}</span>
              {post.excerpt && <span className="text-sm leading-normal text-slate-500">{post.excerpt}</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
