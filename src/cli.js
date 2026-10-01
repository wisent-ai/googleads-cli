#!/usr/bin/env node

import { createGoogleAdsClient } from './index.js'
import { readCredential } from './skarbiec.js'

// The invocation itself is wrong: exit 2 with the usage; any other failure
// exits 1 with its own message (cli.md rule 10).
class UsageError extends Error {}

function usage() {
  return `googleads-cli

Usage:
  googleads accounts --developer-token ITEM#FIELD --access-token ITEM#FIELD
  googleads campaigns --customer <id> [--from YYYY-MM-DD --to YYYY-MM-DD] <credentials>
  googleads metrics --customer <id> --from YYYY-MM-DD --to YYYY-MM-DD <credentials>
  googleads query --customer <id> --gaql <query> <credentials>

Credentials are Skarbiec references: --developer-token and --access-token name ITEM#FIELD,
read with \`skarbiec get ITEM --field FIELD\` (SKARBIEC_BIN names another executable).
No token is accepted in argv or the environment.
Optional: --login-customer <id> for manager-account access, --api-version <version>.`
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
  for (const flag of ['--developer-token', '--access-token']) {
    if (!value(args, flag)) throw new UsageError(`${flag} ITEM#FIELD is required\n\n${usage()}`)
  }
  const client = createGoogleAdsClient({
    developerToken: readCredential(value(args, '--developer-token'), '--developer-token'),
    accessToken: readCredential(value(args, '--access-token'), '--access-token'),
    loginCustomerId: value(args, '--login-customer'),
    apiVersion: value(args, '--api-version'),
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
  process.exitCode = error instanceof UsageError || error?.usage ? 2 : 1
})
