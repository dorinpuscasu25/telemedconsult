import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ArrowRight, Newspaper } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { apiRequest } from '../../lib/api';

type BlogListItem = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  published_at: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

export function BlogListPage() {
  const [posts, setPosts] = useState<BlogListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ data: BlogListItem[] }>('/catalog/blog', { auth: false })
      .then((response) => setPosts(response.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca articolele.'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8">
      <div className="mb-10 max-w-2xl">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Blog</h1>
        <p className="mt-3 text-lg text-slate-500">
          Articole, ghiduri și noutăți despre telemedicină și sănătatea ta.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-white/60" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card className="glass-card border-0">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-slate-500">
            <Newspaper className="h-8 w-8 text-slate-400" />
            Momentan nu există articole publicate.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link key={post.id} to={`/blog/${post.slug}`} className="group">
              <Card className="glass-card h-full overflow-hidden border-0 p-0">
                <div className="aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-primary/10 to-purple-500/10">
                  {post.cover_image_url ? (
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-primary/40">
                      <Newspaper className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <CardContent className="p-5">
                  <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(post.published_at)}
                    {post.author_name && <span>· {post.author_name}</span>}
                  </div>
                  <h2 className="mb-2 line-clamp-2 text-lg font-bold text-slate-900 transition-colors group-hover:text-primary">
                    {post.title}
                  </h2>
                  {post.excerpt && <p className="line-clamp-3 text-sm leading-relaxed text-slate-500">{post.excerpt}</p>}
                  <span className="mt-4 inline-flex items-center text-sm font-medium text-primary">
                    Citește <ArrowRight className="ml-1 h-4 w-4" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
