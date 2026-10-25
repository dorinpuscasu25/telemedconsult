import { useEffect } from 'react';

const APP_NAME = 'telemedconsult.md';

/** Titlul din tab-ul browserului; revine la numele aplicației la ieșire. */
export function usePageTitle(title?: string) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${APP_NAME}`;
    return () => { document.title = previous; };
  }, [title]);
}

