import { useState } from 'react';
import { markNewsSeen, newsSeenAt } from '../../lib/use-shell-counts';
import { BlogListPage } from '../public/BlogListPage';

/** Aceeași prezentare cu fotografii, păstrând audiența și starea de citire a medicului. */
export function DoctorNewsPage() {
  const [seenAt] = useState(newsSeenAt);
  return <BlogListPage basePath="/doctor/noutati" audience="doctors" seenAt={seenAt} onLoaded={markNewsSeen} />;
}
