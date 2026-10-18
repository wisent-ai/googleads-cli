<!-- wisent-banner:start -->
<p align="center">
  <img src="assets/readme-banner.webp" alt="googleads-cli by Wisent" width="100%">
</p>
<!-- wisent-banner:end -->

<!-- wisent-readme-signals:start -->
[![Source](https://img.shields.io/badge/GitHub-Source-181717?logo=github)](https://github.com/wisent-ai/googleads-cli) [![Issues](https://img.shields.io/badge/GitHub-Issues-181717?logo=github)](https://github.com/wisent-ai/googleads-cli/issues) [![Wisent](https://img.shields.io/badge/Wisent-Website-0B0B0B)](https://wisent.com) [![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/qRjpkthq54) [![LinkedIn](https://img.shields.io/badge/LinkedIn-Follow-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/company/wisent-ai/) [![X](https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white)](https://x.com/wisentai) [![Enterprise](https://img.shields.io/badge/Enterprise-Book%20a%20call-0B0B0B?logo=calendly)](https://calendly.com/lbartoszcze)
<!-- wisent-readme-signals:end -->

# Google Ads CLI

[![Release](https://img.shields.io/github/v/release/wisent-ai/googleads-cli?display_name=tag&sort=semver)](https://github.com/wisent-ai/googleads-cli/releases)
[![Downloads](https://img.shields.io/github/downloads/wisent-ai/googleads-cli/total)](https://github.com/wisent-ai/googleads-cli/releases)
[![License](https://img.shields.io/github/license/wisent-ai/googleads-cli)](https://github.com/wisent-ai/googleads-cli)
[![Discord](https://img.shields.io/badge/Discord-Join%20Wisent-5865F2?logo=discord&logoColor=white)](https://discord.gg/qRjpkthq54)

**Google Ads CLI is a small Google Ads API client for accessible-customer discovery, GAQL queries, campaign inventory, and dated performance reporting.**

The command line reads credentials by the role a secret plays, through Stado or an owner-only credentials file; the JavaScript API accepts an injected `fetch` implementation and returns normalized records.

## Included

- accessible Google Ads customer IDs;
- arbitrary caller-supplied GAQL queries;
- campaign inventory with status, channel type, and core metrics; `campaigns`
  takes `--from` and `--to` together or neither;
- campaign metrics by date;
- normalized customer IDs and campaign records; a field or metric the API
  answer omits is `null`, never an invented empty string or zero;
- every answer read strictly: a body that is not JSON is refused with its
  status, the parse cause and the body.

## Explicit non-goals

- The CLI does not mint OAuth tokens, store refresh tokens, choose budgets, or create campaigns automatically.
- API access does not imply permission to mutate an advertiser account.
- Reported values remain Google Ads facts and must be reconciled with first-party conversion and revenue systems.
- Credentials must not be placed on command lines, committed, or attached to issues.

## Quick start

Requires Node.js 20 or newer and a Google Ads developer token and an OAuth access token authorized for the requested account, held either by Stado credential items tagged with a role or in an owner-only credentials file.

```bash
git clone https://github.com/wisent-ai/googleads-cli.git
cd googleads-cli
CREDS='--developer-token google-ads#developer_token --access-token google-ads#access_token'
node src/cli.js accounts $CREDS
node src/cli.js campaigns --customer 123-456-7890 $CREDS
node src/cli.js metrics --customer 123-456-7890 --from 2026-08-01 --to 2026-08-11 $CREDS
```

Each credential flag names a credential reference `ROLE#FIELD`: the field of the secret that plays the role, not the name of a vault item, so renaming or rotating the item changes no invocation. The CLI reads it with `stado credentials get --role ROLE --field FIELD`; Stado refuses a role no item plays, or one several items play, and the CLI exits 1 with that refusal.

Without Stado, pass `--credentials-file PATH`: a JSON object of roles, each an object of fields,

```json
{ "google-ads": { "developer_token": "…", "access_token": "…" } }
```

owned by the user running the CLI and closed to group and others (`chmod go= PATH`). Both references are read from it. A file owned by someone else, open to group or others, not JSON, or without the role or a non-empty string field is refused by name with exit 1. No token is accepted in argv or the environment. For manager-account access pass `--login-customer <id>`; pass `--api-version` when Google advances the contract.

An unknown command, an option the command does not take, a missing option
value, a duplicate valued option or a missing required option exits 2 with the
usage before reading credentials. A reference that is not `ROLE#FIELD` also
exits 2; a failed credential read or API call exits 1 with its cause. `--help`
prints the usage and exits 0.

`node --test 'tests/**/*.test.mjs'` runs the CLI journeys: every wrong invocation above, each naming a credentials file the CLI would refuse if it read it; tokens in `GOOGLE_ADS_DEVELOPER_TOKEN` and `GOOGLE_ADS_ACCESS_TOKEN`, which are not read; malformed references, a role Stado has no secret for, credentials files refused for permissions, shape and missing fields, and a file's tokens sent to the Google Ads API, whose refusal of them is reported.

Every Google Ads answer is read strictly. A body that is not JSON, such as a
proxy's error page, is refused with `Google Ads API returned HTTP <status> with
a body that is not JSON (<cause>): <body>`, never read as no data; a refusal
is its `error.message`, or `Google Ads API returned HTTP <status>: <body>`
when it carries none. `tests/api/answers.test.mjs` hands the client a fetch
answering with each of these and checks that every searchStream batch is read.

Search-stream batches must be objects. An omitted `results` field represents
an empty batch; a present `results` field must be an array. Malformed batches
are refused with their payload instead of disappearing from the report.
Accessible-customer responses must be objects; a null, array or primitive
response is refused with its payload before customer names are read.

With `GOOGLEADS_TEST_DEFECT` and `GOOGLEADS_TEST_CRITERION` set together, a run
on committed source that passes every case writes `criterion.json` under
`.build/real-tests/cli-usage/<stamp>/` (tests/cli),
`.build/real-tests/credentials/<stamp>/` (tests/credentials) or
`.build/real-tests/api-answers/<stamp>/` (tests/api): the revision, the digests
of Node and of the test, and every run with what it observed. Setting only one
of them fails the run.

Library use:

```js
import { createGoogleAdsClient } from '@wisent-ai/googleads-cli'

const googleAds = createGoogleAdsClient({ developerToken, accessToken, loginCustomerId })
const campaigns = await googleAds.listCampaigns(customerId)
```

## Operational model

- **Transport:** official Google Ads REST API over HTTPS.
- **Credentials:** `ROLE#FIELD` references for the CLI, read through Stado or an owner-only `--credentials-file`; explicit constructor fields for the library.
- **State:** none.
- **Output:** JSON to stdout, `--text` path-value output, or normalized JavaScript records.
- **Cost and mutation:** reporting may consume API quota; this release exposes read operations only.

## Project status and support

- **Maturity:** public development source, version `0.1.0`.
- **Issues:** [wisent-ai/googleads-cli](https://github.com/wisent-ai/googleads-cli/issues).
- **Security:** use private GitHub Security Advisories; never attach tokens, customer data, query responses, or account identifiers to a public issue.
- **License:** Apache License 2.0; see [LICENSE](LICENSE).
