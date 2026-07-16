# RecruiterStack — "Add to Sequence" Chrome extension

A small Chrome extension that adds a button to LinkedIn profile pages. Click it,
type the person's email, pick one of your RecruiterStack sequences, and they're
enrolled — all in one step.

It talks to your platform through the API-key endpoints shipped in Stage 1
(`/api/ext/sequences` and `/api/ext/enroll`).

---

## What's in here

| File | What it does |
|---|---|
| `manifest.json` | The extension's "ID card" — tells Chrome it runs on LinkedIn profiles |
| `background.js` | The only part that talks to the RecruiterStack API (holds the key) |
| `content.js` / `content.css` | The green button + form shown on a LinkedIn profile |
| `options.html` / `options.js` | One-time setup: paste your platform URL + API key |
| `popup.html` / `popup.js` | The toolbar panel showing connection status |

No build step, no npm — it's plain files Chrome loads directly.

---

## Install it (one time)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (toggle, top-right).
3. Click **Load unpacked**.
4. Select this `extension` folder.
5. The RecruiterStack icon appears in your toolbar. (Pin it for easy access.)

## Connect it (one time)

1. In RecruiterStack, go to **Settings → API Keys** and click **Generate**.
   Copy the key (it's shown only once).
2. Click the extension's toolbar icon → **Open settings**.
3. Set **Platform URL**:
   - Live site: `https://recruiterstack.in`
   - Local testing: `http://localhost:3000`
4. Paste the **API key** and click **Save**, then **Test connection**.
   You should see "Connected ✓".

## Use it

1. Open any LinkedIn profile (`linkedin.com/in/...`).
2. Click the green **➕ Add to sequence** button (bottom-right).
3. The name is filled in automatically. Type the person's **email**, pick a
   **sequence**, and click **Add to sequence**.
4. You'll see a confirmation. Done — they're in the sequence.

---

## Notes & limits (v1)

- **Email is required.** LinkedIn doesn't expose emails, so you type it in. A
  later version can auto-find it.
- **Allowed platform URLs** are fixed in `manifest.json` (`host_permissions`):
  `recruiterstack.in` and `localhost:3000`. To point at a different URL, add it
  there and reload the extension.
- **No custom icon yet** — Chrome shows a default puzzle-piece icon. Cosmetic;
  can be added later.
- **Name capture** reads the profile's main heading. If LinkedIn changes their
  page structure, this selector may need a tweak.
