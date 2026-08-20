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

The command line reads credentials from the environment; the JavaScript API accepts an injected `fetch` implementation and returns normalized records.

## Included

- accessible Google Ads customer IDs;
- arbitrary caller-supplied GAQL queries;
- campaign inventory with status, channel type, and core metrics;
- campaign metrics by date;
- normalized customer IDs and campaign records.

## Explicit non-goals

- The CLI does not mint OAuth tokens, store refresh tokens, choose budgets, or create campaigns automatically.
- API access does not imply permission to mutate an advertiser account.
- Reported values remain Google Ads facts and must be reconciled with first-party conversion and revenue systems.
- Credentials must not be placed on command lines, committed, or attached to issues.

## Quick start

Requires Node.js 20 or newer, a Google Ads developer token, and an OAuth access token authorized for the requested account.

```bash
git clone https://github.com/wisent-ai/googleads-cli.git
cd googleads-cli
export GOOGLE_ADS_DEVELOPER_TOKEN='...'
export GOOGLE_ADS_ACCESS_TOKEN='...'
node src/cli.js accounts
node src/cli.js campaigns --customer 123-456-7890
node src/cli.js metrics --customer 123-456-7890 --from 2026-08-01 --to 2026-08-11
```

For manager-account access, set `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. Override the API version with `GOOGLE_ADS_API_VERSION` when Google advances the contract.

Library use:

```js
import { createGoogleAdsClient } from '@wisent-ai/googleads-cli'

const googleAds = createGoogleAdsClient({ developerToken, accessToken, loginCustomerId })
const campaigns = await googleAds.listCampaigns(customerId)
```

## Operational model

- **Transport:** official Google Ads REST API over HTTPS.
- **Credentials:** environment variables for the CLI; explicit constructor fields for the library.
- **State:** none.
- **Output:** JSON to stdout or normalized JavaScript records.
- **Cost and mutation:** reporting may consume API quota; this release exposes read operations only.

## Project status and support

- **Maturity:** public development source, version `0.1.0`.
- **Issues:** [wisent-ai/googleads-cli](https://github.com/wisent-ai/googleads-cli/issues).
- **Security:** use private GitHub Security Advisories; never attach tokens, customer data, query responses, or account identifiers to a public issue.
- **License:** Apache License 2.0; see [LICENSE](LICENSE).
