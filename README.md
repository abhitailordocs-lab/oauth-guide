# OAuth App Setup Guides

**Live:** TODO(you): paste your Vercel link · **Repo:** TODO(you): paste your GitHub link

A developer building an AI agent needs to know one thing before they commit: *will getting my OAuth app ready take an hour or weeks, and what blocks me?*
This project gives ready-made guides for a few apps, plus a live agent that researches any app and generates a shareable guide.

## Run it
```
cp .env.example .env     # add GEMINI_API_KEY and TAVILY_API_KEY (never commit .env)
npx vercel dev
```
Deploy: import the repo on Vercel and set the same env vars.

## Key decisions
- **Two readiness numbers.** "Ready to build" and "ready for real users" are shown separately, because the gap between them (for example Google's testing mode vs verification) is where developers get surprised.
- **Three difficulty tiers:** easy (self-serve), review (self-serve plus verification), gated (audit, partner approval or paid tier).
- **Own app vs Composio's managed app.** Composio's directory lists managed OAuth for GitHub, Gmail, Google Drive and Zoom (checked by hand 2026-10-31). So each guide first says whether you need your own app at all; the rest of the guide covers the own-app path.
- **Agent / you / provider split** in every guide: what an agent can do for you, what needs your login or sign-off, and what only the provider controls.
- **Evidence labels** on every claim: `tested`, `documented`, `community-reported`, `inferred`, `unverified`.

## How the live agent stays honest
1. Tavily searches (3 queries) and returns source text; the model may only use those sources.
2. For each "documented" claim the model must give an exact quote. The server checks the quote appears in that source's text, that the source text mentions the app, and that the URL was among the pages searched. Failures become `unverified`.
3. Forum posts become `community-reported`; video sources become `inferred`. The model can never claim `tested`; only server-side endpoint probes earn it.
4. Every item in the guide lists the claims behind it and shows a badge (sourced / community only / inferred / unsourced).

## What I checked
- **GitHub:** TODO(you): your timed registration (minutes, date) and anything that differed from the guide.
- **Google:** TODO(you): table of claims confirmed / corrected / not found against Google's own pages. Original claims came from third-party docs.
- **Composio:** managed OAuth confirmed on the toolkit pages for GitHub, Gmail, Google Drive and Zoom. Consent-screen behavior of the managed Google app was not checked.
- **Live generation, Zoom, three runs:** run 1 had ten "documented" claims, several from YouTube and forums, none quote-checked, and an invented Composio note. Run 2 added quotes; the check caught one bad claim, but a claim based on Mailchimp's text slipped into the Zoom guide. Run 3 had four official quotes, three community-reported claims and an honest "unknown" review timeline. TODO(you): add one or two things you noticed yourself.

## Limitations
- A badge means an item cites a verified claim, not that the claim proves the item. The quote check proves the words exist in the source, not that they support the claim.
- The "source mentions the app" check can wrongly downgrade claims for apps known by another name than the page uses.
- The agent cannot pass CAPTCHAs, payment or business verification, so "tested" is limited to endpoint probes plus the hand-run registrations above.
- Review times are often unpublished; the guide says "unknown" rather than guess.
- Rate limiting and caching are in-memory per server instance, so they are best-effort. Share links carry the whole guide in the URL, so they get long; a database would be better.
- Generation takes 30 to 90 seconds with no streaming progress.

## Next
Streaming progress, a database for saved guides, a scheduled re-check of seed guides, and scaling the library to 100 apps.
