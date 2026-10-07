# "Never Miss a Customer" — Interactive Demo

A fictional US restaurant website (**Casa Verde — Modern Mexican Kitchen, Austin TX**)
with an embedded AI host (**Maya**) that demonstrates Tameer Ali's
**"Never Miss a Customer"** automation system to a business owner in ~60 seconds.

**100% static. No backend, no build step, zero external requests, zero tracking.**
Works from `file://` and any static host.

## What it demonstrates (the 4 flows)

1. **Menu / hours Q&A** — ask about hours, location, menu, vegan / vegetarian /
   gluten-free options, prices, takeout & delivery. Instant, accurate answers.
2. **Table booking** — party size → day → time → name → optional text confirmation →
   confirmation card with booking reference (e.g. `CA-JTY24`).
3. **After-hours lead capture** *(the money flow)* — tap "🌙 After-hours demo":
   a notice reads *"It's 11:42 PM — we're closed right now, but I'm Maya,
   Casa Verde's host, and I'm still here."* Visitor leaves name + phone (+ request)
   → "Saved! We'll confirm by 11 AM" → a mini **"Saved to your dashboard"** card
   appears, showing the captured lead. This is the moment that sells the system:
   *every late-night visitor becomes a morning reservation, not a missed customer.*
4. **Review request** — tap "⭐ Rate your visit" → tap the stars:
   - **5 stars** → "Would you share that on Google?" + Google review button.
   - **1–4 stars** → "What could we do better?" → feedback captured →
     "Our manager will personally follow up."

Plus: graceful fallbacks for off-script input (never dead-ends), quick-reply chips,
typing indicator with realistic delays, auto-open nudge after ~8s, and the site's
"Book a table" buttons jump straight into the booking flow.

Copy is in **buyer language** ("never miss a customer", "after-hours") — never
"AI chatbot" jargon. Widget header/footer carries a small credit:
*"Live demo by Tameer Ali · AI Automation"*.

## Personalize per prospect

Append query params — the restaurant name, tagline, city, address and phone swap
everywhere (page + widget + booking-reference prefix):

```
index.html?biz=Rose%20%26%20Rye&tagline=Modern%20American%20Bistro&city=Denver%2C%20CO&address=88%20Blake%20St%2C%20Denver%2C%20CO%2080202&phone=%28303%29%20555-0119
```

| Param     | Default                          |
|-----------|----------------------------------|
| `biz`     | Casa Verde                       |
| `tagline` | Modern Mexican Kitchen           |
| `city`    | Austin, TX                       |
| `address` | 2410 S Congress Ave, Austin, TX 78704 |
| `phone`   | (512) 555-0147                   |

`?fast=1` skips animation delays (used by the automated test harness).

**Outreach workflow:** for each prospect, generate their link with `?biz=<Their Business Name>`
so the demo greets them as *their own* restaurant. The personalized demo is the
outreach hook — audit opens, demo closes.

## Hosting options

- **Fastest (recommended):** Netlify Drop / Vercel / Cloudflare Pages / GitHub Pages —
  drag the `demo/` folder, get a public HTTPS link in ~1 minute.
- **Any static host** works — it's plain HTML/CSS/JS.
- **Local preview:** `python3 -m http.server` inside `demo/`, or just double-click
  `index.html` (works from `file://`).

Once hosted and verified, the parent saves the public URL to
`~/workspace/outreach/demo-link.txt` (do **not** create that file here).

## Verification

End-to-end harness at `/tmp/verify/verify.js` (puppeteer-core + local Chromium):
walks all 4 flows, the 5-star and 3-star review branches, bad-phone rejection,
graceful fallback, `?biz=` personalization, hero-CTA booking jump, and a mobile
viewport — and fails on **any** console/page error.

Last run: **27/27 checks passed, zero console errors** (2026-09-30).

## Files

- `index.html` — restaurant site + widget markup
- `assets/style.css` — all styling (system fonts only, no external requests)
- `assets/widget.js` — Maya conversation engine (intents, booking/after-hours/review
  state machines, personalization, test hooks via `window.__maya`)

*Note: bookings, leads and reviews in this demo are simulated in the browser —
the footer says so. A real client build wires these to the client's actual
booking/CRM/notification stack.*
