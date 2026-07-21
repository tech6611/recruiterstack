# Publishing the extension to the Chrome Web Store

A step-by-step guide for the parts only you can do. The package and all the
listing text are already prepared (see below).

## What's ready for you
- **The upload file:** `extension/recruiterstack-extension.zip`
  (rebuild any time with `bash extension/package.sh`)
- **All listing text:** `extension/STORE-LISTING.md` — copy/paste each field.

## ⚠️ Do this first (a real blocker)
For your users to actually *use* the extension after installing, they must be
able to log into the live site (recruiterstack.in) to generate an API key. The
live site's login is currently in development mode — fix that to a production
setup **before** promoting the extension, or new users won't be able to connect
it. (You can still submit for review in parallel, since review takes a few days.)

## Steps

### 1. Create a developer account (one time, $5)
1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with the Google account you want to own the listing.
3. Pay the one-time US$5 registration fee.

### 2. Upload the package
1. In the dashboard, click **+ New item**.
2. Upload `extension/recruiterstack-extension.zip`.

### 3. Fill in the listing
Open `extension/STORE-LISTING.md` and paste each field into the matching box
(Name, Summary, Description, Category, and all the Privacy fields).

### 4. Add screenshots (required — at least 1, size 1280×800 or 640×400)
Good ones to capture:
1. A LinkedIn profile with the green "Add to sequence" button visible.
2. The open panel with the sequence dropdown.
3. The extension's settings screen (connection).
Take them at your screen, crop to 1280×800. (I can help resize if you send the raw images.)

### 5. Set visibility & submit
1. Set **Visibility** to **Public**.
2. Set distribution regions (or leave all).
3. Click **Submit for review**. Review usually takes 1–3 days.

### 6. After approval
You'll get a public install link. Share it with your users, and add an "Install
the LinkedIn extension" link inside RecruiterStack (e.g. near Settings → API Keys)
so people find it.

---

## Privacy page — paragraph to add to /privacy
Add this so your privacy policy explicitly covers the extension (Google checks):

> **RecruiterStack Chrome Extension.** Our "Add to Sequence" browser extension
> runs on LinkedIn profile pages you visit. When you click "Add to sequence," it
> reads the profile's visible name and page URL and, together with the email you
> enter, sends them to your own RecruiterStack workspace to create and enrol the
> candidate. The extension stores your RecruiterStack URL and API key locally in
> your browser. It sends data only to your RecruiterStack workspace — never to us
> or any third party — and does not sell or share your data.
