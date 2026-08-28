# 📚 3D Interactive Goodreads Bookshelf

![Screenshot of the finished 3D Interactive Goodreads Bookshelf](screenshot-1.0.0.png)
An interactive 3D WebGL bookshelf widget built with **Three.js** and **GSAP**. It connects to your public Goodreads profile to procedurally render dynamic, natural-looking stacks for your **"To Be Read"** and **"Recently Read"** shelves, alongside a floating shingled fan display for your **"Currently Reading"** books.

Each book features procedural dimensions derived from page counts, dynamic palette-matched spine and back-cover canvas generation, conditional morphing sticky-note reviews, smooth focus transitions, click-and-drag panning, scroll-wheel zooming, and native fullscreen support.

---

## ✨ Features

* **Three Dynamic Shelves:**
  * **To Be Read:** Procedural vertical stack sorted by `user_date_added` (newest on top).
  * **Recently Read:** Procedural vertical stack sorted by `user_read_at` (newest on top).
  * **Currently Reading:** Floating, fanned shingled cascade displayed semi-upright behind the main stacks.
* **Procedural Book Geometry:** Realistically scales spine thickness based on page count, with natural jitter in position and yaw angle so stacks look casual and realistic.
* **Dynamic Texture & Palette Pipeline:** Automatically extracts dominant and accent colors from front covers using an offscreen 2D canvas to render matching spines (with titles, authors, and curvature shading) and back covers (with blurbs, star ratings, and metadata).
* **Review-Only Sticky Notes:** If you have written a review on Goodreads, a yellow post-it note appears in the upper-right quadrant of the cover. Clicking the note curls it upward via vertex morph targets to reveal the cover beneath.
* **Smooth Camera & Inspection Controls:**
  * **Click to Inspect:** Smoothly transitions any book from its shelf into front-and-center focus.
  * **Flip (180°):** Click an active book to flip it end-over-end to read the back blurb and stats.
  * **Click & Drag:** Pan the focused book freely across the camera plane.
  * **Scroll Wheel Zoom:** Zoom in and out ($0.6\times$ to $3.0\times$) to inspect fine text.
  * **Hover Lift:** Hovering over any book slightly lifts it along its normal vector.
  * **Click Away:** Clicking empty space smoothly returns the book to its exact position on its shelf.
* **Fullscreen Mode:** Toggle button in the upper-right corner expands the widget to full viewport resolution (with <kbd>Esc</kbd> support) without breaking camera framing or aspect ratios.

---

## 🚀 Quick Start

### 1. Clone & Run Locally

Because the project uses standard ES Modules (`<script type="module">`), it must be served over HTTP/HTTPS rather than opened directly as a local file (`file:///`).

```bash
# Clone the repository
git clone [https://github.com/your-username/book-flipper.git](https://github.com/your-username/book-flipper.git)
cd book-flipper

# Start a local dev server (choose one):
npx serve .
# or
npx vite
# or
python -m http.server 8000
```

Open `http://localhost:3000` (or `http://localhost:8000`) in your browser.

---

## ⚙️ Configuration & Customization

### 1. Set Your Goodreads Profile

Open `main.js` and update the configuration variables at the top of the file:

```javascript
// ----------------------------------------------------------------------
// CONFIGURATION: Set your Goodreads profile URL or numeric User ID
// ----------------------------------------------------------------------
export const GOODREADS_PROFILE = '[https://www.goodreads.com/user/show/5106656-matthew-royal](https://www.goodreads.com/user/show/5106656-matthew-royal)';
export const MAX_BOOKS_PER_STACK = 6;
// ----------------------------------------------------------------------
```

> **Note:** Accepts either a full profile URL (e.g. `https://www.goodreads.com/user/show/1234567-username`) or just the raw numeric ID (`1234567`). Your Goodreads account privacy settings must allow public shelf viewing.

---

### 2. Configure Your Backend Proxy

Goodreads restricts client-side browser requests via CORS and CloudFront WAF. A lightweight serverless proxy (such as a free Cloudflare Worker) bridges your frontend to Goodreads RSS feeds.

In `GoodreadsService.js`, update `proxyUrl` with your deployed Cloudflare Worker endpoint:

```javascript
// Inside GoodreadsService.js -> fetchGoodreadsShelf()
const proxyUrl = `[https://your-worker-subdomain.workers.dev/?id=$](https://your-worker-subdomain.workers.dev/?id=$){userId}&shelf=${shelf}`;
```

---

### 3. Customize Physical Stacking & Spines

Adjust physical dimensions, spine limits, and jitter randomness in `BookStackModule.js` via `STACK_CONFIG`:

```javascript
export const STACK_CONFIG = {
  defaultWidth: 1.4,          // Base width (X axis)
  defaultHeight: 2.1,         // Base height (Z axis)
  minThickness: 0.14,        // Thinnest spine limit
  maxThickness: 0.65,        // Thickest spine limit
  pageThicknessRatio: 0.0006, // Multiplier for pageCount -> spine thickness
  stackGap: 0.006,           // Air gap between books to prevent Z-fighting
  jitter: {
    yaw: 0.12,               // Random rotation variance in radians (± ~7°)
    translationX: 0.04,      // Random offset along X
    translationZ: 0.04,      // Random offset along Z
  },
  colors: {
    pages: 0xf5eedc,         // Page trim color
    defaultCover: 0x2c3e50,  // Fallback cover color while images load
    spineEdge: 0x1a252f
  }
};
```

---

### 4. Adjust Interaction & Zoom Settings

* **Camera Elevation:** In `main.js` under `initScene()`, adjust `this.camera.position.set(0, 3.0, 5.7)` and `this.camera.lookAt(0, 1.05, 0)` to shift the circular pedestals and floating shelf higher or lower relative to the bottom labels.
* **Inspection Zoom Limits:** In `BookInteractionController.js`, adjust `this.minZoom` (default `0.6`), `this.maxZoom` (default `3.0`), and `hoverLift` (default `0.08`).

---

## ☁️ Cloudflare Worker Setup (Backend Proxy)

To deploy your own free proxy on Cloudflare Workers:

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages** → **Create Application** → **Create Worker**.
2. Paste the following worker script into the editor:

```javascript
export default {
  async fetch(request) {
    // Handle CORS preflight (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get("id");
    const shelf = url.searchParams.get("shelf") || "read";

    if (!userId) {
      return new Response("Missing 'id' query parameter", { status: 400 });
    }

    const goodreadsUrl = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${shelf}`;

    try {
      const response = await fetch(goodreadsUrl, {
        headers: {
          // Goodreads blocks default fetch User-Agents
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        return new Response(`Goodreads returned status ${response.status}`, {
          status: response.status,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }

      const xmlData = await response.text();

      return new Response(xmlData, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600" // Cache for 1 hour
        }
      });
    } catch (err) {
      return new Response(err.message, {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};
```
3. Click **Deploy**. Copy your `*.workers.dev` URL into `GoodreadsService.js`.

---

## 🎮 Interactive Controls

| Action | Control | Result |
| :--- | :--- | :--- |
| **Hover Book** | Move mouse over stack | Lifts book slightly on the Y-axis. |
| **Inspect Book** | Click on any book in a stack | Animates book into centered camera focus. |
| **Flip Book** | Click the focused book | Rotates book 180° to view the back blurb/ratings. |
| **Pan Book** | Click + Drag on focused book | Moves the book smoothly across the view plane. |
| **Zoom Book** | Scroll Wheel | Zooms in/out (0.6x to 3.0x) for reading fine text. |
| **Curl Review Note** | Click on the yellow sticky note | Curls note up/down via vertex morphing. |
| **Return to Stack** | Click empty background space | Returns the book to its resting position in the stack. |

---

## 📄 Dependencies

* [Three.js](https://threejs.org/) (r160+) - 3D Scene graph, materials, and WebGL rendering.
* [GSAP](https://greensock.com/gsap/) (3.12+) - High-performance transform and quaternion slerp tweening.
* [wsrv.nl](https://images.weserv.nl/) - Zero-config CORS image cache used for canvas pixel analysis.
        return