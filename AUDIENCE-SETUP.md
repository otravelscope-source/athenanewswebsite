# ATHENA audience setup

The site serves indexable public pages, publisher information, article structured
data, share previews, category pages, RSS, a general sitemap and a recent-news
sitemap. Reader accounts work independently of ChatGPT. Email is deliberately
inactive until a real service and verified sender are configured.

## 1. Use your own domain

Choose a domain you own. Add the root domain and its `www` hostname to the
existing ATHENA Railway service, targeting port 3000. Use the routing and
ownership DNS records returned by Railway. Wait for DNS verification and TLS.
Do not remove the existing Railway address or the `/app/data` volume.

Set `SITE_URL` to the one preferred HTTPS origin, without a trailing slash,
after that domain is working. The site redirects the root/`www` alternative
and the Railway address to the preferred origin. Other previous domain names
can be listed in `CANONICAL_HOST_ALIASES`.

The `www` prefix is an optional hostname. It does not make a site indexable
or improve its ranking by itself. Both forms should point to the same site,
with a single canonical origin.

## 2. Verify Google Search Console

Open https://search.google.com/search-console using the owner's Google account.
Add a Domain property if you control DNS, or a URL-prefix property for the exact
canonical HTTPS address. For URL-prefix HTML-tag verification, copy only the
`content` value into Railway's `GOOGLE_SITE_VERIFICATION` variable. The app
serves it on public HTML pages after deployment. For a Domain property, add
Google's exact TXT record at your DNS provider instead.

Verify ownership in Search Console. Submit `/sitemap.xml` and
`/news-sitemap.xml`, inspect the homepage and representative recent article
URLs, and request indexing if Google reports them as eligible. Inspect crawl
errors and the canonical chosen by Google. Do not use the Google Indexing API
for ordinary articles, or the obsolete sitemap-ping endpoint.

The news sitemap includes only news first reported within the past two days.
Archive articles remain in the general sitemap and keep their original dates.
Search appearance is Google's decision; deployment or sitemap submission is
not proof of indexing. See https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl

## 3. Activate email updates

Create or use an owner-controlled Resend account. Verify a sending domain you
own using the exact DNS records shown in Resend, including SPF and DKIM.
Create a sending API key. In the existing Railway service's production
variables, set:

- `RESEND_API_KEY`: the sending key; store it as a secret, not in GitHub or chat.
- `NEWSLETTER_FROM`: a verified sender, for example `ATHENA <news@your-domain>`.
- `NEWSLETTER_REPLY_TO`: an inbox you actually receive mail in.
- `NEWSLETTER_ENABLED`: `true` only after the sender has been verified.

Variable changes trigger deployment. Verify a real signup and inbox delivery
using the owner's email address before announcing email alerts publicly.
A Resend provider acceptance is recorded as `accepted`; it is not proof that a
message reached the inbox. Check provider delivery logs for actual delivery,
bounces and spam placement. Never use an unverified Gmail address as the
sending identity.

Readers choose email updates separately from account signup. They must confirm
their email address before news alerts begin. The confirmation link expires
after 48 hours. Opening it does not activate email; the reader confirms with a
button. Signed unsubscribe links support one-click POST requests. Readers can
also disable email in their account, even if delivery is temporarily inactive.

Each new published article is recorded once. Only confirmed, opted-in readers
whose chosen sections match receive it. Existing archive entries are baselined
on first setup rather than sent to every subscriber. Later archive publications
are labelled with their original reporting dates. Revisions and restarts do not
resend previously accepted alerts. Messages remain queued in SQLite across
deployments. Retries use a stable Resend idempotency key and identical payload;
ambiguous retries are held before the provider's 24-hour deduplication window
expires. No recipient list is exposed to another subscriber.

The process checks for newly published articles every 30 seconds while the
service runs. It also checks after an editor publication and on startup after
article imports. Keep one Railway replica because the app uses its persistent
SQLite volume. Configure continuous service availability for timely delivery.

## 4. Grow and measure readership

Link the canonical website from ATHENA's existing social profiles and outreach.
Share specific stories with an accurate headline and image. The article pages
offer copy-link, WhatsApp and X sharing, related stories and reader signup.
RSS subscribers can follow `/feed.xml`.

The editorial studio's Audience & delivery panel shows aggregate page views,
published story counts, confirmed email subscribers and service readiness.
These counters store no visitor IP addresses, account identities or individual
reading history and use no analytics cookies. Counts include crawler visits;
they are page requests, not unique people. Use Search Console for actual Google
impressions, queries and clicks. Keep publication regular and source-led;
avoid filler or relabelling archive reports as current news.
