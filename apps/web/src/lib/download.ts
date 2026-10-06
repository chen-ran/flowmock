import { authFetch } from '../api/client.ts';

// An export behind the admin API carries the session header, which a plain
// link cannot send, so the bytes are fetched here and handed to the browser as
// a download. A failure is returned for the caller to report.
export const downloadWithSession = async (url: string, filename: string): Promise<{ error: string | null }> => {
  const response = await authFetch(url);
  if (!response.ok) return { error: `HTTP ${response.status}` };
  const href = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(href);
  }
  return { error: null };
};
