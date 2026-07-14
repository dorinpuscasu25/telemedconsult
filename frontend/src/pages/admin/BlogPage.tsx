import React, { useEffect, useState } from 'react';
import { Newspaper, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';

type BlogPost = {
  id?: number;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  cover_image_url: string;
  author_name: string;
  is_published: boolean;
};

const emptyPost: BlogPost = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  cover_image_url: '',
  author_name: '',
  is_published: false
};

export function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [newPost, setNewPost] = useState<BlogPost>(emptyPost);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadPosts = () => {
    apiRequest<{ data: Partial<BlogPost>[] }>('/admin/blog-posts')
      .then((response) => setPosts((response.data ?? []).map((post) => ({
        ...emptyPost,
        ...post,
        slug: post.slug ?? '',
        excerpt: post.excerpt ?? '',
        body: post.body ?? '',
        cover_image_url: post.cover_image_url ?? '',
        author_name: post.author_name ?? ''
      }))))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca articolele.'));
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const notify = (text: string) => {
    setMessage(text);
    setError('');
  };
  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setMessage('');
  };

  const cleanPayload = (post: BlogPost) => ({
    title: post.title,
    slug: post.slug || undefined,
    excerpt: post.excerpt || undefined,
    body: post.body,
    cover_image_url: post.cover_image_url || undefined,
    author_name: post.author_name || undefined,
    is_published: post.is_published
  });

  const savePost = async (post: BlogPost) => {
    setIsSaving(true);
    try {
      const path = post.id ? `/admin/blog-posts/${post.id}` : '/admin/blog-posts';
      await apiRequest(path, { method: post.id ? 'PUT' : 'POST', body: JSON.stringify(cleanPayload(post)) });
      if (!post.id) setNewPost(emptyPost);
      notify(post.id ? 'Articol actualizat.' : 'Articol creat.');
      loadPosts();
    } catch (err) {
      fail(err, 'Nu am putut salva articolul.');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePost = async (post: BlogPost) => {
    if (!post.id || !window.confirm('Ștergi definitiv acest articol?')) return;
    setIsSaving(true);
    try {
      await apiRequest(`/admin/blog-posts/${post.id}`, { method: 'DELETE' });
      notify('Articol șters.');
      loadPosts();
    } catch (err) {
      fail(err, 'Nu am putut șterge articolul.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Blog</h1>
        <p className="text-slate-500">Publică și gestionează articolele care apar pe pagina publică Blog.</p>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Plus className="mr-2 h-5 w-5 text-primary" />
            Articol nou
          </CardTitle>
          <CardDescription>Lasă slug-ul gol pentru a-l genera automat din titlu.</CardDescription>
        </CardHeader>
        <CardContent>
          <PostForm post={newPost} onChange={setNewPost} onSave={() => savePost(newPost)} isSaving={isSaving} />
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {posts.length === 0 && (
          <Card className="border-slate-200/70 bg-white shadow-sm">
            <CardContent className="p-8 text-center text-slate-500">Nu există articole.</CardContent>
          </Card>
        )}
        {posts.map((post, index) => (
          <Card key={post.id ?? index} className="border-slate-200/70 bg-white shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    <Newspaper className="mr-2 h-5 w-5 text-primary" />
                    {post.title || 'Articol fără titlu'}
                  </CardTitle>
                  <CardDescription>{post.is_published ? 'Publicat pe site.' : 'Ciornă — nevizibil public.'}</CardDescription>
                </div>
                <Button variant="outline" className="rounded-xl text-red-600" disabled={!post.id || isSaving} onClick={() => deletePost(post)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Șterge
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <PostForm
                post={post}
                onChange={(next) => setPosts((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)))}
                onSave={() => savePost(post)}
                isSaving={isSaving}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PostForm({ post, onChange, onSave, isSaving }: {
  post: BlogPost;
  onChange: (post: BlogPost) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Titlu" value={post.title} onChange={(value) => onChange({ ...post, title: value })} />
        <TextField label="Slug (opțional)" value={post.slug} onChange={(value) => onChange({ ...post, slug: value })} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Autor" value={post.author_name} onChange={(value) => onChange({ ...post, author_name: value })} />
        <TextField label="URL imagine copertă" value={post.cover_image_url} onChange={(value) => onChange({ ...post, cover_image_url: value })} />
      </div>
      <div className="space-y-2">
        <Label>Rezumat</Label>
        <Textarea
          value={post.excerpt}
          onChange={(event) => onChange({ ...post, excerpt: event.target.value })}
          className="min-h-[70px] rounded-xl bg-white/70"
          placeholder="Scurtă descriere afișată în lista de articole."
        />
      </div>
      <div className="space-y-2">
        <Label>Conținut</Label>
        <Textarea
          value={post.body}
          onChange={(event) => onChange({ ...post, body: event.target.value })}
          className="min-h-[160px] rounded-xl bg-white/70"
          placeholder="Corpul articolului. Paragrafele se păstrează pe rânduri separate."
        />
      </div>
      <div className="grid gap-4 md:grid-cols-[180px_auto] md:items-center">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-4">
          <Label>Publicat</Label>
          <Switch checked={post.is_published} onCheckedChange={(checked) => onChange({ ...post, is_published: checked })} />
        </div>
        <Button className="rounded-xl md:justify-self-start" disabled={isSaving || !post.title.trim() || !post.body.trim()} onClick={onSave}>
          <Save className="mr-2 h-4 w-4" />
          Salvează
        </Button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl bg-white/70" />
    </div>
  );
}
