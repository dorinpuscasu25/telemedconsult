import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';
import type { BlogPost } from './BlogPage';

type BlogForm = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  author_name: string;
  is_published: boolean;
  cover_image_url: string | null;
};

const emptyPost: BlogForm = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  author_name: '',
  is_published: false,
  cover_image_url: null
};

export function AdminBlogEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [post, setPost] = useState<BlogForm>(emptyPost);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(id));
  const [isSaving, setIsSaving] = useState(false);
  const previewUrl = useImagePreview(coverFile, removeCover ? null : post.cover_image_url);

  useEffect(() => {
    if (!id) return;

    apiRequest<{ post: BlogPost }>(`/admin/blog-posts/${id}`)
      .then(({ post: response }) => setPost({
        title: response.title,
        slug: response.slug,
        excerpt: response.excerpt ?? '',
        body: response.body,
        author_name: response.author_name ?? '',
        is_published: response.is_published,
        cover_image_url: response.cover_image_url
      }))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca articolul.'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const canSave = useMemo(() => post.title.trim() !== '' && post.body.trim() !== '', [post.body, post.title]);

  const chooseCover = (file: File | null) => {
    setCoverFile(file);
    if (file) setRemoveCover(false);
  };

  const clearCover = () => {
    setCoverFile(null);
    setRemoveCover(Boolean(post.cover_image_url));
    if (inputRef.current) inputRef.current.value = '';
  };

  const savePost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;

    setIsSaving(true);
    setError('');

    const form = new FormData();
    form.append('title', post.title.trim());
    form.append('body', post.body);
    form.append('slug', post.slug.trim());
    form.append('excerpt', post.excerpt.trim());
    form.append('author_name', post.author_name.trim());
    form.append('is_published', post.is_published ? '1' : '0');
    form.append('remove_cover_image', removeCover ? '1' : '0');
    if (coverFile) form.append('cover_image', coverFile);
    if (id) form.append('_method', 'PUT');

    try {
      await apiRequest(id ? `/admin/blog-posts/${id}` : '/admin/blog-posts', {
        method: 'POST',
        body: form
      });
      navigate('/admin/blog', { replace: true, state: { message: id ? 'Articol actualizat.' : 'Articol creat.' } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva articolul.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="rounded-xl bg-white p-8 text-slate-500 shadow-sm">Se încarcă articolul...</div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="icon" className="rounded-xl bg-white" onClick={() => navigate('/admin/blog')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{id ? 'Editează articolul' : 'Articol nou'}</h1>
          <p className="mt-1 text-slate-500">Completează articolul și încarcă imaginea de copertă direct de pe dispozitiv.</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={savePost} className="space-y-6">
        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Conținut articol</CardTitle>
            <CardDescription>Slug-ul se generează automat dacă îl lași gol.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <TextField label="Titlu" value={post.title} required onChange={(title) => setPost({ ...post, title })} />
              <TextField label="Slug (opțional)" value={post.slug} onChange={(slug) => setPost({ ...post, slug })} />
            </div>
            <div className="grid gap-5 md:grid-cols-[1fr_220px]">
              <TextField label="Autor" value={post.author_name} onChange={(author_name) => setPost({ ...post, author_name })} />
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                <Label htmlFor="published">Publicat</Label>
                <Switch id="published" checked={post.is_published} onCheckedChange={(is_published) => setPost({ ...post, is_published })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="excerpt">Rezumat</Label>
              <Textarea id="excerpt" maxLength={255} value={post.excerpt} onChange={(event) => setPost({ ...post, excerpt: event.target.value })} className="min-h-[90px] rounded-xl" />
              <p className="text-right text-xs text-slate-400">{post.excerpt.length}/255</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Conținut</Label>
              <Textarea id="body" required value={post.body} onChange={(event) => setPost({ ...post, body: event.target.value })} className="min-h-[320px] rounded-xl" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Imagine de copertă</CardTitle>
            <CardDescription>JPG, PNG sau WebP, maximum 5 MB.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-[260px_1fr] md:items-center">
            <div className="grid h-44 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
              {previewUrl ? <img src={previewUrl} alt="Previzualizare copertă" className="h-full w-full object-cover" /> : <ImagePlus className="h-9 w-9 text-slate-300" />}
            </div>
            <div className="space-y-3">
              <Input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseCover(event.target.files?.[0] ?? null)} className="rounded-xl bg-white" />
              <p className="text-sm text-slate-500">Fișierul primește automat un nume sigur pe server.</p>
              {previewUrl && (
                <Button type="button" variant="outline" className="rounded-xl text-red-600" onClick={clearCover}>
                  <Trash2 className="mr-2 h-4 w-4" /> Elimină imaginea
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="rounded-xl bg-white" onClick={() => navigate('/admin/blog')}>Renunță</Button>
          <Button type="submit" disabled={!canSave || isSaving} className="rounded-xl px-7">
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Se salvează...' : 'Salvează articolul'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function TextField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  const id = label.toLowerCase().replace(/\W+/g, '-');
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl" />
    </div>
  );
}

function useImagePreview(file: File | null, currentUrl: string | null): string | null {
  const [preview, setPreview] = useState<string | null>(currentUrl);

  useEffect(() => {
    if (!file) {
      setPreview(currentUrl);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [currentUrl, file]);

  return preview;
}
