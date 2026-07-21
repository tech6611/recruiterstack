# Chrome Web Store listing — copy/paste content

Everything below is ready to paste into the Web Store submission form. Fields map
to what Google asks for.

---

## Name
RecruiterStack — Add to Sequence

## Summary (max 132 characters)
Add the LinkedIn profile you're viewing to a RecruiterStack outreach sequence in one click.

## Category
Workflow & Planning

## Detailed description
RecruiterStack — Add to Sequence lets recruiters enrol a candidate into a
RecruiterStack outreach sequence straight from a LinkedIn profile.

While viewing someone's LinkedIn profile, click the "Add to sequence" button.
The person's name is picked up automatically; you add their email, choose one of
your active sequences, and they're enrolled — no copy-pasting between tabs.

Requires a RecruiterStack account. Connect the extension once with an API key
from your workspace (Settings → API Keys), and you're set.

Features:
• One-click "Add to sequence" button on LinkedIn profile pages
• Choose from your workspace's active sequences
• Creates the candidate in RecruiterStack if they're new
• Your data stays between your browser and your own RecruiterStack workspace

---

## Privacy — single purpose description
This extension has one purpose: to add the LinkedIn profile a user is viewing to
one of their own RecruiterStack outreach sequences.

## Privacy — permission justifications

**storage**
Stores the user's RecruiterStack platform URL and API key locally in the browser
so they don't have to re-enter them on every use.

**Host permission: https://recruiterstack.in/ (and www)**
The extension sends the candidate's details to the user's own RecruiterStack
workspace to create the candidate and enrol them in the chosen sequence. This is
the only server it contacts.

**Content script on https://www.linkedin.com/in/***
Displays the "Add to sequence" button on LinkedIn profile pages and reads the
visible profile name and page URL so the user doesn't have to type them.

**Remote code**
No. The extension runs only the code included in the package.

## Privacy — data usage disclosures
The extension handles:
• Personally identifiable information — the profile name and page URL it reads,
  and the email the user types.

For each, in the form:
• Purpose: **App functionality** (creating/enrolling the candidate in the user's
  own RecruiterStack account).
• NOT sold to third parties.
• NOT used or transferred for purposes unrelated to the single purpose above.
• NOT used to determine creditworthiness or for lending.

Data is sent only to the user's own RecruiterStack workspace. The extension does
not send data to the extension developer or any other third party.

## Privacy policy URL
https://recruiterstack.in/privacy

(See PUBLISH.md → "Privacy page" for the short paragraph to add to that page so it
explicitly covers the extension.)
