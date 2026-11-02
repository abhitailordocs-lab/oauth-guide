# OAuth App Setup Guides

**Live app:** https://oauth-guide-flax.vercel.app  
**Source:** https://github.com/abhitailordocs-lab/oauth-guide

A developer building an AI agent needs to know, before committing, whether getting an OAuth app ready takes an hour or weeks, and what could block them. This project provides two ready-made guides (GitHub, Google) and a live agent that researches any app and generates a shareable guide with every claim labeled by how well it is supported.

## Try it
- Open the live app, read the GitHub and Google guides, then type any app name or website (for example `Zoom`, `asana.com`) and click **Generate guide**. Generation takes about 30 to 90 seconds.
- **Copy share link** puts the whole guide in the URL. **Copy JSON** exports it.

## Run locally
```
cp .env.example .env     # add GEMINI_API_KEY and TAVILY_API_KEY (never commit .env)
npx vercel dev
```
Deploy by importing the repo on Vercel and setting the same environment variables. No credentials are in this repository.

## What a guide tells you
- **Difficulty tier:** easy (self-serve), review (self-serve plus verification), gated (audit, partner approval or paid tier).
- **Two readiness times:** "ready to build" and "ready for real users", shown separately because the gap between them is where developers get surprised (for example Google's testing mode versus verification).
- **Own app or Composio's managed app:** each guide says whether Composio offers a managed OAuth app. This matters because a developer using Composio may not need their own app for a first connection. The rest of each guide covers the own-app path.
- **Who does what:** what an agent can do for the developer, what needs the developer's own login or sign-off, and what only the provider controls.
- **Blockers:** common failures and what to do next.
- **Evidence:** every claim is labeled `tested`, `documented`, `community-reported`, `inferred` or `unverified`, with its source.

## How the live agent stays honest
1. Tavily runs three searches and returns source text. The model may only use those sources.
2. For each "documented" claim the model must give an exact quote. The server checks that the quote appears in that source's text, that the source text mentions the app, and that the URL was among the pages searched. Failing claims become `unverified`.
3. Forum posts become `community-reported`. Video sources become `inferred`. The model can never claim `tested`; only server-side endpoint probes earn that label.
4. Every item in a guide lists the claims behind it and shows a badge: sourced, community only, inferred or unsourced.

## What I checked, and what I did not

| Item | Result |
|---|---|
| GitHub registration | Registered a test OAuth app by hand: about 10 minutes, one attempt, 2026-10-31. |
| GitHub claims | The first draft said an OAuth app allows one callback URL (from older GitHub Enterprise Server docs). My own settings page showed up to 10, so I replaced those claims with quotes from GitHub's current docs. I also added two facts the draft missed: user tokens expire by default, and an owner can have up to 100 OAuth apps. |
| Composio | Managed OAuth is listed as available for GitHub, Gmail, Google Drive and Zoom on Composio's toolkit pages (checked by hand, 2026-10-31). What the managed Google app's consent screen shows users was not checked. |
| Live generation | Run on Zoom three times while building. Run 1 had ten "documented" claims, several from YouTube and forums, none quote-checked, and an invented Composio note. Run 2 added quotes and the check caught one bad claim, but a claim based on Mailchimp's text slipped into the Zoom guide. Run 3 had four official quotes, three community-reported claims and an honest "unknown" review timeline. Each run led to a fix. |
| **Not verified** | **The Google guide's claims (100 test users, 7-day token expiry, verification tiers, security assessment, timelines) come from third-party documentation that agree with each other. I did not check them against Google's own pages.** |
| **Not verified** | Organization-level restrictions on GitHub OAuth apps; the GitHub "no approval step" claim is marked inferred. |
| **Not done** | No third seed guide; live generation was only exercised on Zoom. |

## Limitations
- A badge means an item cites a verified claim, not that the claim proves the item. The quote check proves the words exist in the source, not that they support the claim.
- The "source mentions the app" check can wrongly downgrade claims for apps known by a different name than the page uses.
- Agents cannot pass CAPTCHAs, payment or business verification, so `tested` is limited to endpoint probes plus the hand-run GitHub registration.
- Review times are often unpublished; guides say "unknown" instead of guessing, which makes them less useful for hard providers.
- Rate limiting (5 guides per visitor per 10 minutes) and a 30-minute cache are in-memory per server instance, so they are best-effort.
- Share links carry the whole guide in the URL and can get long; a database would be better.
- Free-tier model and search quotas apply, and Gemini can be slow or overloaded; the server retries and falls back to other models.

## Next
Verify the Google guide against Google's own pages, add streaming progress, store guides in a database, re-check seed guides on a schedule, and scale the library toward 100 apps.
