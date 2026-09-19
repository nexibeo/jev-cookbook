# 15 · Gmail labeler

**The job:** connect your own Gmail, let Jev read recent inbox mail, and label every message by type (`Jev/Work`, `Jev/Newsletter`, `Jev/Bills finance`, `Jev/Suspicious`…) plus `Jev/Needs reply` and `Jev/Deadline`. The labeler only ever **adds labels**: it never deletes, archives, moves or sends anything, and it changes nothing unless you pass `--apply`.

```bash
npm run 15                      # try it on the 30-email sample inbox, no Gmail needed
npm run gmail                   # your Gmail, dry run: prints the labels it would add
npm run gmail -- --apply        # add the labels in Gmail
npm run gmail -- --max 50 --query "in:inbox newer_than:3d" --headers-only
npm run test:gmail              # offline tests of the Gmail side (fake Google, real Jev)
```

## How it works

1. **Connect:** Google sign-in for desktop apps: a local loopback page on `127.0.0.1` with PKCE and a state check, no dependencies. Dry runs ask only for `gmail.readonly`; `--apply` asks for `gmail.modify`, the smallest scope that can add labels. The refresh token is saved in `out/gmail-token.json`, which is gitignored and readable only by you.
2. **Read:** the newest messages matching `in:inbox newer_than:7d -label:jev` (every processed message gets a `Jev` label, so nothing is labelled twice).
3. **Check facts in code:** a `List-Unsubscribe` header, a calendar invite (`.ics`), a Reply-To on a different domain, and whether you're in To rather than Cc or a mailing list. These are exact, so code checks them and passes them to Jev as facts.
4. **Ask Jev once per email:** `category`, a Choice over 11 described types, plus two Nouls: "the sender expects a personal reply or RSVP from you" and "asks you to do something by a specific date", each saying what doesn't count (newsletters, sale end dates).
5. **Decide in code:** confidence below 0.7 gets `Jev/Review` instead of a guess, and suspicious mail never gets action labels, so a phishing email's "verify within 24 hours" doesn't become a Deadline.

## Results

**Sample inbox** ([sample-inbox.json](sample-inbox.json), 30 hand-labelled emails: friends, colleagues, newsletters, promotions, orders, bills, security alerts, invites, travel, and 3 phishing attempts):

- **Category:** 30/30 (one receipt got `Jev/Review` at low confidence instead of a guess).
- **Needs reply:** 93%. **Deadline:** 93%. The four misses are arguable: a hotel email inviting a reply about an optional transfer and a shop asking for a review got `Needs reply`, and a meeting invite and a candidate's "which day works?" got `Deadline`.
- **Phishing:** 3/3 caught, 0 false alarms. Jev saw the pressure to act fast in them, which is exactly why the code keeps action labels off suspicious mail.
- **Cost:** 30 calls, $0.0010, median 0.36 s per email. A full year of a busy inbox costs well under a dollar.

**Gmail side** ([test/gmail.test.mjs](test/gmail.test.mjs)): 5/5 tests pass against a fake Google that returns real Gmail API message formats. They check that headers, bodies and facts are read correctly, including HTML-only mail; that sign-in rejects a forged callback, saves the token and refreshes it without a browser; that a dry run sends only GET requests; and that `--apply` adds only `Jev/` labels and never deletes, trashes or sends.

## Connect your Gmail (about 10 minutes, once)

You need your own Google OAuth client. It's free and stays in your Google account.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (any name).
2. **APIs & Services → Library:** search for **Gmail API** and click **Enable**.
3. **Google Auth Platform → Branding / Audience** (older consoles: **OAuth consent screen**): user type **External**, fill in an app name and your email, and under **Audience → Test users** add the Gmail address you want to label.
4. **Clients → Create client:** application type **Desktop app**. Copy the client ID and secret into `.env`:
   ```
   GMAIL_CLIENT_ID=...apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=...
   ```
5. Run `npm run gmail`. Your browser opens Google's sign-in; because this is your own unpublished app, Google shows "Google hasn't verified this app". Click **Continue**, then allow access. The terminal prints the labels it would add.
6. When the labels look right, run `npm run gmail -- --apply`. Google asks once more, this time for permission to add labels.

While your app is in Google's "Testing" status, Google expires its sign-ins after 7 days; the labeler then simply asks you to sign in again. To disconnect, delete `out/gmail-token.json` and remove the app at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Privacy

For each email, the sender, subject, the code-checked facts and the first 1,500 characters of the body go to Jev on OpenRouter. OpenRouter lists TypeSafe as not training on requests and not retaining prompts. With `--headers-only`, only the sender, subject and facts are sent. Nothing else leaves your machine, and the Google token never does.

## Run it automatically

Once you're happy with the labels, schedule `npm run gmail -- --apply` every hour or two (cron, launchd, or Task Scheduler). The `-label:jev` query means each run only handles new mail.

## Adapt it

- Rename or add categories in `CATEGORIES` (keep a short description for each).
- Add your own Nouls, such as "from a client", "mentions an invoice number", or "asks for a meeting", and map them to labels.
- Add rules in code: always label mail from your boss `Jev/Needs reply`, or never label your own sent threads.
- The same classifier works for Outlook or IMAP: replace `gmail.mjs` with a reader that returns `{ from, subject, facts, body }`.
