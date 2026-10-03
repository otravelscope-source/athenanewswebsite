# ATHENA — your independent website

This package contains the complete standalone ATHENA website, including the public newsroom, article pages, editor login, publishing controls and image uploads.

It runs without a ChatGPT account, Sites subscription, Canva account, OpenAI API key or platform-provided database. The application has no npm dependencies. Node.js and a persistent storage directory are required.

## What is finished

- Public homepage, news sections and individual article pages.
- An editor account with an email address and a password you choose on your server.
- Drafts, previews, publishing, editing and recoverable archiving.
- Cover-image uploads, captions and credits.
- Articles and images stored on your server, preserved across restarts.
- Downloadable article archive; database and photo-backup instructions.
- Responsive styling, page metadata, sitemap and crawler controls.
- Docker Compose deployment configuration with an HTTPS reverse proxy.

The package includes the same three starter stories from the earlier site: an archive excerpt and two editorial notes. On 2 October 2026, its live article database contained no additional saved records. This is a content snapshot; later changes to the earlier site do not synchronise automatically.

## What is still needed to put it online

A hosting account that can run Node.js 24 or Docker **with persistent disk storage**, plus a domain name for the included HTTPS deployment configuration. A domain by itself is not hosting. Static-only hosting cannot run the editor or database.

No independent host has been provisioned, charged or deployed as part of this package. The existing hosted site has not been replaced. The independent version is tested and ready for deployment; it does not yet have a new live URL.

## For you

Give this package to your hosting administrator, or provide the hosting provider and domain in the conversation so deployment can be tailored to them. Do not send account passwords in chat.

Once deployed:

1. Open your own domain to read ATHENA.
2. Open `/studio` and sign in with your own editor email and password.
3. Choose **New article**, enter a headline, subtitle, section, byline and article text.
4. Upload a cover image or provide an HTTPS image URL. Add photo credit.
5. Use **Preview**, then **Save draft** or **Publish article**.
6. Choose a saved article to edit it, move it back to draft, or archive it. Archived articles remain in the editor and can be restored.

Nothing needs to be posted through ChatGPT. You manage articles directly on your website.

## For the hosting administrator

Read `DEPLOYMENT.md`. Run `npm test` before deployment. Set up the editor interactively on the server. No default credentials are included.

The site is designed for one editor and one server instance. It is a complete small-newsroom publishing application, not a multi-user newsroom workflow or subscription/paywall platform.
