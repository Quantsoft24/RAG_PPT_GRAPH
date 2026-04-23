/**
 * Bookmark utilities for PRISM Regulatory Hub.
 * Uses localStorage for client-side persistence.
 */

export interface BookmarkedDoc {
  id: number;
  type: string;
  title: string;
  date: string;
  severity: string | null;
  bookmarkedAt: number;
}

export function getBookmarks(): BookmarkedDoc[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('prism_reg_bookmarks') || '[]');
  } catch { return []; }
}

export function toggleBookmark(doc: { id: number; type: string; title: string; date: string; severity?: string | null }): boolean {
  const bookmarks = getBookmarks();
  const idx = bookmarks.findIndex(b => b.id === doc.id);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
    localStorage.setItem('prism_reg_bookmarks', JSON.stringify(bookmarks));
    return false; // removed
  } else {
    bookmarks.unshift({ ...doc, severity: doc.severity || null, bookmarkedAt: Date.now() });
    localStorage.setItem('prism_reg_bookmarks', JSON.stringify(bookmarks.slice(0, 200)));
    return true; // added
  }
}

export function isBookmarked(id: number): boolean {
  return getBookmarks().some(b => b.id === id);
}

export function clearBookmarks(): void {
  localStorage.removeItem('prism_reg_bookmarks');
}
