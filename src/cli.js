#!/usr/bin/env node

import { createGoogleAdsClient } from './index.js'

// The invocation itself is wrong: exit 2 with the usage; any other failure
// exits 1 with its own message (cli.md rule 10).
class UsageError extends Error {}

function usage() {
  return `googleads-cli

Usage:
  googleads accounts
  googleads campaigns --customer <id> [--from YYYY-MM-DD --to YYYY-MM-DD]
  googleads metrics --customer <id> --from YYYY-MM-DD --to YYYY-MM-DD
  googleads query --customer <id> --gaql <query>

Credentials are read from GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_ACCESS_TOKEN. Optional: GOOGLE_ADS_LOGIN_CUSTOMER_ID and GOOGLE_ADS_API_VERSION.`
}

function value(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

async function main() {
  const args = process.argv.slice(2)
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(usage())
    return
  }
  const known = args[0] === 'accounts' || args[0] === 'campaigns' || args[0] === 'metrics' || args[0] === 'query'
  if (!known) throw new UsageError(`Unknown command: ${args[0]}\n\n${usage()}`)
  const client = createGoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    accessToken: process.env.GOOGLE_ADS_ACCESS_TOKEN,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    apiVersion: process.env.GOOGLE_ADS_API_VERSION,
  })
  let result
  if (args[0] === 'accounts') result = await client.listAccessibleCustomers()
  else if (args[0] === 'campaigns') result = await client.listCampaigns(value(args, '--customer'), { dateFrom: value(args, '--from'), dateTo: value(args, '--to') })
  else if (args[0] === 'metrics') result = await client.reportMetrics(value(args, '--customer'), value(args, '--from'), value(args, '--to'))
  else if (args[0] === 'query') result = await client.search(value(args, '--customer'), value(args, '--gaql'))
  else throw new UsageError(`Unknown command: ${args[0]}\n\n${usage()}`)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = error instanceof UsageError ? 2 : 1
})
