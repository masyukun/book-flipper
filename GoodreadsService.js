/**
 * GoodreadsService.js
 * Fetches and parses public Goodreads shelf RSS feeds.
 */

// Extracts the numeric ID from URLs like "https://www.goodreads.com/user/show/5106656-matthew-royal" or "5106656"
export function extractGoodreadsUserId(input) {
  if (!input) return null;
  const match = String(input).match(/(?:user\/show\/)?(\d+)/);
  return match ? match[1] : input;
}

/**
 * Fetches shelf RSS XML via a CORS proxy and parses it into clean JSON objects.
 *
 * @param {string} userIdOrUrl - Profile URL or numeric User ID
 * @param {'read' | 'to-read' | 'currently-reading'} shelf - Shelf name
 * @param {number} [limit=6] - Maximum books to load in the stack
 * @returns {Promise<Array<Object>>}
 */
export async function fetchGoodreadsShelf(userIdOrUrl, shelf = 'read', limit = 6) {
  const userId = extractGoodreadsUserId(userIdOrUrl);
  if (!userId) throw new Error('Invalid Goodreads user ID or profile URL.');

  // Direct endpoint to your Cloudflare worker
  const proxyUrl = `https://soft-tree-66cd.masyukun.workers.dev/?id=${userId}&shelf=${shelf}`;

  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Goodreads ${shelf} shelf (${response.status})`);
  }

  const xmlText = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const items = Array.from(xmlDoc.querySelectorAll('item')).slice(0, limit);

  return items.map((item, index) => {
    const getField = (tagName) => item.querySelector(tagName)?.textContent?.trim() || '';

    const rawDesc = getField('book_description') || getField('description');
    const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();

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
      review: cleanReview || (myRatingNum ? `Rated ${myRatingNum} / 5 stars on Goodreads` : null),
      description: cleanDesc,
      isbn: getField('isbn'),
      coverUrl: safeCoverUrl
    };
  });
}