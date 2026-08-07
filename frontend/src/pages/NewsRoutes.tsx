import { Navigate, useLocation, useParams } from 'react-router-dom';
import { BlogListPage } from './public/BlogListPage';
import { BlogPostPage } from './public/BlogPostPage';

/**
 * Redirecționează vechile adrese /blog/:slug către /noutati/:slug, ca linkurile
 * deja trimise utilizatorilor să continue să funcționeze după redenumire.
 */
export function LegacyBlogPostRedirect() {
  const { slug } = useParams<{ slug: string }>();

  return <Navigate to={slug ? `/noutati/${slug}` : '/noutati'} replace />;
}

/**
 * Lista de noutăți montată în interiorul aplicației, sub prefixul rolului
 * curent (ex. /patient/noutati), ca utilizatorul logat să poată citi fără să
 * iasă din cont.
 */
export function AppNewsListPage() {
  const { pathname } = useLocation();
  // "/patient/noutati" -> "/patient/noutati"
  const basePath = pathname.replace(/\/+$/, '');

  return <BlogListPage basePath={basePath} />;
}

/** Un articol citit din interiorul aplicației. */
export function AppNewsPostPage() {
  const { pathname } = useLocation();
  // "/patient/noutati/slug" -> "/patient/noutati"
  const basePath = pathname.split('/').slice(0, 3).join('/');

  return <BlogPostPage backTo={basePath} />;
}
