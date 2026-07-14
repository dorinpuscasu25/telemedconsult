import React, { useEffect, useState } from 'react';
import { Edit3, Image, Newspaper, Plus, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table';
import { apiRequest } from '../../lib/api';

export type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  cover_image_url: string | null;
  author_name: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
};

export function AdminBlogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [message, setMessage] = useState((location.state as { message?: string } | null)?.message ?? '');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadPosts = () => {
    setIsLoading(true);
    apiRequest<{ data: BlogPost[] }>('/admin/blog-posts')
      .then((response) => setPosts(response.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca articolele.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const deletePost = async (post: BlogPost) => {
    if (!window.confirm(`Ștergi definitiv articolul „${post.title}”?`)) return;

    setDeletingId(post.id);
    setError('');
    try {
      await apiRequest(`/admin/blog-posts/${post.id}`, { method: 'DELETE' });
      setMessage('Articol șters.');
      loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut șterge articolul.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Blog</h1>
          <p className="mt-2 text-slate-500">Articolele publice și ciornele sunt afișate într-un singur tabel.</p>
        </div>
        <Button className="h-11 rounded-xl px-5" onClick={() => navigate('/admin/blog/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Adaugă articol
        </Button>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <Card className="overflow-hidden border-slate-200/70 bg-white shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="w-[88px] px-4">Copertă</TableHead>
                <TableHead>Articol</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="px-4 text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="h-28 text-center text-slate-500">Se încarcă articolele...</TableCell></TableRow>
              )}
              {!isLoading && posts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-36 text-center">
                    <Newspaper className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-2 text-slate-500">Nu există articole. Apasă „Adaugă articol”.</p>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="px-4">
                    {post.cover_image_url ? (
                      <img src={post.cover_image_url} alt="" className="h-12 w-16 rounded-lg border border-slate-200 object-cover" />
                    ) : (
                      <div className="grid h-12 w-16 place-items-center rounded-lg bg-slate-100 text-slate-400"><Image className="h-5 w-5" /></div>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[260px] whitespace-normal">
                    <p className="font-semibold text-slate-950">{post.title}</p>
                    <p className="mt-1 text-xs text-slate-500">/{post.slug}</p>
                  </TableCell>
                  <TableCell>{post.author_name || '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${post.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {post.is_published ? 'Publicat' : 'Ciornă'}
                    </span>
                  </TableCell>
                  <TableCell>{new Date(post.published_at || post.created_at).toLocaleDateString('ro-MD')}</TableCell>
                  <TableCell className="px-4">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="rounded-lg" onClick={() => navigate(`/admin/blog/${post.id}/edit`)}>
                        <Edit3 className="mr-1.5 h-4 w-4" /> Editare
                      </Button>
                      <Button variant="outline" size="icon" className="rounded-lg text-red-600" disabled={deletingId === post.id} onClick={() => deletePost(post)} aria-label={`Șterge ${post.title}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
