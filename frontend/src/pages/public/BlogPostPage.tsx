import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { apiRequest } from '../../lib/api';

type BlogPost = {
  id: number;
  title: string;
  slug: string;
  body: string;
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

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    setIsLoading(true);
    apiRequest<{ data: BlogPost }>(`/catalog/blog/${slug}`, { auth: false })
      .then((response) => setPost(response.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Articolul nu a fost găsit.'))
      .finally(() => setIsLoading(false));
  }, [slug]);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-14 md:px-8">
      <Link to="/blog" className="mb-8 inline-flex items-center text-sm font-medium text-slate-500 transition-colors hover:text-slate-800">
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Înapoi la blog
      </Link>

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-10 w-3/4 animate-pulse rounded-lg bg-white/60" />
          <div className="h-64 w-full animate-pulse rounded-2xl bg-white/60" />
        </div>
      ) : error || !post ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
          {error || 'Articolul nu a fost găsit.'}
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
            <CalendarDays className="h-4 w-4" />
            {formatDate(post.published_at)}
            {post.author_name && <span>· {post.author_name}</span>}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{post.title}</h1>

          {post.cover_image_url && (
            <img
              src={post.cover_image_url}
              alt={post.title}
              className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover shadow-lg"
            />
          )}

          <div className="mt-8 whitespace-pre-line text-lg leading-relaxed text-slate-700">{post.body}</div>
        </>
      )}
    </article>
  );
}
