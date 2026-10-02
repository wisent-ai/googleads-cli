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
Optional: --login-customer <id> for manager-account access, --api-version <version>.
Results print as JSON; --text prints the same result as one path: value line per field.`
}

function value(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

// The same result for people: one `path: value` line per field (cli.md rule 13).
function render(result, text) {
  if (!text) return JSON.stringify(result, null, 2)
  const lines = []
  const walk = (node, path) => {
    if (Array.isArray(node) && node.length) node.forEach((item, index) => walk(item, `${path}[${index}]`))
    else if (node && typeof node === 'object' && Object.keys(node).length) for (const [key, item] of Object.entries(node)) walk(item, path ? `${path}.${key}` : key)
    else lines.push(path ? `${path}: ${node === null || typeof node === 'object' ? '-' : node}` : String(node))
  }
  walk(result, '')
  return lines.join('\n')
}

// The flags each command reads and the ones it cannot run without; anything
// else is refused with exit 2 before a credential is read (rules 10, 12).
const SHARED = '--developer-token --access-token --login-customer --api-version'.split(' ')
const FLAGS = {
  accounts: SHARED,
  campaigns: SHARED.concat('--customer --from --to'.split(' ')),
  metrics: SHARED.concat('--customer --from --to'.split(' ')),
  query: SHARED.concat('--customer --gaql'.split(' ')),
}
const REQUIRED = {
  accounts: '--developer-token --access-token'.split(' '),
  campaigns: '--developer-token --access-token --customer'.split(' '),
  metrics: '--developer-token --access-token --customer --from --to'.split(' '),
  query: '--developer-token --access-token --customer --gaql'.split(' '),
}

function checkInvocation(command, args) {
  const known = FLAGS[command]
  if (!known) throw new UsageError(`Unknown command: ${command}\n\n${usage()}`)
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--text') continue
    if (!known.includes(arg)) throw new UsageError(`googleads ${command} does not take ${arg}; it takes ${known.join(', ')}, --text\n\n${usage()}`)
    if (index + 1 >= args.length) throw new UsageError(`${arg} needs a value\n\n${usage()}`)
    index += 1
  }
  for (const flag of REQUIRED[command]) {
    if (!value(args, flag)) throw new UsageError(`googleads ${command} requires ${flag}\n\n${usage()}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(usage())
    return
  }
  checkInvocation(args[0], args)
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
  console.log(render(result, args.includes('--text')))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = error instanceof UsageError || error?.usage ? 2 : 1
})
