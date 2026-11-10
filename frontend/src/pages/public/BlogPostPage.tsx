import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useSiteContent } from '../../contexts/SiteContentContext';
import { longDate } from './HomePage';

type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt?: string | null;
  body: string;
  category?: string | null;
  cover_image_url: string | null;
  published_at: string | null;
};

type OtherPost = { id: number; slug: string; title: string; category?: string | null; published_at: string | null };

/**
 * N2/N4: o coloană de citit de 720 px, care se termină cu alte trei noutăți.
 * `backTo` permite aceeași pagină în aplicație, cu întoarcerea la lista rolului.
 */
export function BlogPostPage({ backTo = '/noutati' }: { backTo?: string } = {}) {
  const { slug } = useParams<{ slug: string }>();
  const { text } = useSiteContent();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [others, setOthers] = useState<OtherPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    setIsLoading(true);
    setError('');
    apiRequest<{ data: BlogPost }>(`/catalog/blog/${slug}`, { auth: false })
      .then((response) => { setPost(response.data); document.title = `${response.data.title} · telemedconsult.md`; })
      .catch((err) => setError(err instanceof Error ? err.message : 'Articolul nu a fost găsit.'))
      .finally(() => setIsLoading(false));
    apiRequest<{ data: OtherPost[] }>('/catalog/blog', { auth: false })
      .then((response) => setOthers((response.data ?? []).filter((item) => item.slug !== slug).slice(0, 3)))
      .catch(() => undefined);
  }, [slug]);

  const minutes = post ? Math.max(1, Math.round(post.body.split(/\s+/).length / 200)) : 0;

  return (
    <div className="bg-white">
      <article className="mx-auto flex max-w-[720px] flex-col gap-3.5 px-5 pb-8 pt-4 md:gap-5 md:px-0 md:pb-16 md:pt-10">
        <Link to={backTo} className="flex h-8 items-center gap-1.5 self-start text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />{text('news.title')}</Link>
        {isLoading ? (
          <div className="flex flex-col gap-4"><div className="h-10 w-3/4 animate-pulse rounded-lg bg-slate-100" /><div className="aspect-video w-full animate-pulse rounded-2xl bg-slate-100" /></div>
        ) : error || !post ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">{error || 'Articolul nu a fost găsit.'}</p>
        ) : (
          <>
            <span className="text-[13px] text-slate-500 md:text-sm">{post.category && <><b className="font-semibold text-blue-600">{post.category}</b> · </>}{longDate(post.published_at)}<span className="hidden md:inline"> · {minutes} min de citit</span></span>
            <h1 className="text-[28px] font-bold leading-[1.12] tracking-[-.02em] md:text-[44px] md:leading-[1.1] md:tracking-[-.03em] md:[text-wrap:balance]">{post.title}</h1>
            {post.excerpt && <p className="text-[17px] leading-[1.55] text-slate-700 md:text-xl">{post.excerpt}</p>}
            {post.cover_image_url && <img src={post.cover_image_url} alt="" className="aspect-video w-full rounded-xl object-cover md:my-3 md:rounded-2xl" />}
            <div className="whitespace-pre-line text-base leading-[1.7] text-slate-700 md:text-[17px]">{post.body}</div>
          </>
        )}
      </article>
      {others.length > 0 && (
        <div className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 pb-12 pt-8 md:px-10 md:pb-16 md:pt-12">
            <h2 className="text-xl font-bold md:text-[22px]">Alte noutăți</h2>
            <div className="grid gap-3.5 md:grid-cols-3 md:gap-5">
              {others.map((item) => (
                <Link key={item.id} to={`${backTo}/${item.slug}`} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300">
                  <span className="text-xs text-slate-500">{item.category && <><b className="font-semibold text-blue-600">{item.category}</b> · </>}{longDate(item.published_at)}</span>
                  <span className="text-[17px] font-semibold leading-[1.35]">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
