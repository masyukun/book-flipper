/**
 * GoodreadsService.js
 * Fetches and parses public Goodreads shelf RSS feeds with date sorting and review filtering.
 */

export function extractGoodreadsUserId(input) {
  if (!input) return null;
  const match = String(input).match(/(?:user\/show\/)?(\d+)/);
  return match ? match[1] : input;
}

/**
 * Parses RSS date strings safely into millisecond timestamps.
 */
function parseRssDate(dateStr) {
  if (!dateStr) return 0;
  const parsed = Date.parse(dateStr);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Fetches shelf RSS XML, sorts by date descending, and maps book metadata.
 *
 * @param {string} userIdOrUrl - Profile URL or numeric User ID
 * @param {'read' | 'to-read' | 'currently-reading'} shelf - Shelf name
 * @param {number} [limit=6] - Maximum books to load in the stack
 * @returns {Promise<Array<Object>>}
 */
export async function fetchGoodreadsShelf(userIdOrUrl, shelf = 'read', limit = 6) {
  const userId = extractGoodreadsUserId(userIdOrUrl);
  if (!userId) throw new Error('Invalid Goodreads user ID or profile URL.');

  // Direct endpoint to your Cloudflare Worker
  const proxyUrl = `https://soft-tree-66cd.masyukun.workers.dev/?id=${userId}&shelf=${shelf}`;

  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Goodreads ${shelf} shelf (${response.status})`);
  }

  const xmlText = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  
  // Parse all items first before slicing so sorting is accurate across the entire shelf
  const items = Array.from(xmlDoc.querySelectorAll('item'));

  const parsedBooks = items.map((item, index) => {
    const getField = (tagName) => item.querySelector(tagName)?.textContent?.trim() || '';

    // Extract relevant date field according to shelf type
    let dateStr = '';
    if (shelf === 'to-read') {
      dateStr = getField('user_date_added') || getField('pubDate');
    } else if (shelf === 'read') {
      // Fallback to date added or pubDate if user did not log an explicit finish date
      dateStr = getField('user_read_at') || getField('user_date_added') || getField('pubDate');
    } else {
      dateStr = getField('user_date_added') || getField('pubDate');
    }

    const timestamp = parseRssDate(dateStr);

    const rawDesc = getField('book_description') || getField('description');
    const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();

    // Extract written review text only
    const rawReview = getField('user_review');
    const cleanReview = rawReview ? rawReview.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim() : null;

    const myRatingNum = parseFloat(getField('user_rating')) || null;

    let cover = getField('book_large_image_url') || getField('book_medium_image_url') || getField('book_image_url');
    if (cover.includes('nophoto')) {
      cover = '';
    }

    const safeCoverUrl = cover ? `https://images.weserv.nl/?url=${encodeURIComponent(cover)}` : '';

    return {
      id: getField('book_id') || `${shelf}-${index}`,
      title: getField('title') || 'Untitled',
      author: getField('author_name') || 'Unknown Author',
      pageCount: parseInt(getField('num_pages'), 10) || 320,
      rating: parseFloat(getField('average_rating')) || 0,
      ratingsCount: parseInt(getField('ratings_count'), 10) || 0,
      myRating: myRatingNum,
      // Only attach a review string if written content exists
      review: (cleanReview && cleanReview.length > 0) ? cleanReview : null,
      description: cleanDesc,
      isbn: getField('isbn'),
      coverUrl: safeCoverUrl,
      dateString: dateStr,
      timestamp
    };
  });

  // Sort descending: newest date at index 0
  parsedBooks.sort((a, b) => b.timestamp - a.timestamp);

  // Return the top N most recent books
  return parsedBooks.slice(0, limit);
}