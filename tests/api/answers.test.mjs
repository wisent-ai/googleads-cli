// How the Google Ads client reads API answers. createGoogleAdsClient takes the
// fetch it sends requests through as an input; the journey hands it one that
// answers with a real Response of the shape the Google Ads API, or a proxy in
// front of it, sends, and checks that:
//   - a searchStream answer's rows, across every batch, are returned;
//   - an answer that is not JSON is refused with its status, the parse cause
//     and the text, never read as no data;
//   - a refusal carrying error.message is reported as that message, and one
//     without it with its status and whole body;
//   - search terms are read with their campaign, ad group and metrics, and
//     a campaign id that is not numeric is refused before any request;
//   - budgets are read with their campaign, an omitted field null;
//   - keywords are read with match type and quality score, and a campaign id
//     that is not numeric is refused before any request;
//   - wasted spend is the terms that cost and converted nothing;
//   - pacing holds spend to the daily budget over the days asked.
//
//   node --test tests/api/answers.test.mjs
//
// With GOOGLEADS_TEST_DEFECT and GOOGLEADS_TEST_CRITERION named together, a
// run on committed source that passes every case writes criterion.json under
// .build/real-tests/api-answers/<stamp>/.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { constants as http } from 'node:http2'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createGoogleAdsClient } from '../../src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defectId = process.env.GOOGLEADS_TEST_DEFECT?.trim()
const criterion = process.env.GOOGLEADS_TEST_CRITERION?.trim()
assert.equal(Boolean(defectId), Boolean(criterion),
  'GOOGLEADS_TEST_DEFECT and GOOGLEADS_TEST_CRITERION are named together or not at all')

// The shell's status for success (https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html).
const SUCCEEDED = 0

const commands = []
function git(...args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, SUCCEEDED, run.stderr)
  commands.push({ executable: 'git', args, exit: run.status })
  return run.stdout
}
const revision = git('rev-parse', 'HEAD').trim()
const uncommitted = git('status', '--porcelain', '--', 'src', 'tests/api')
assert.ok(!defectId || uncommitted === '', 'commit the client and this test before qualification')

// A customer id is ten digits written with or without dashes; this run's
// process id, padded, is one nobody owns here.
const CUSTOMER = String(process.pid).padStart('0123456789'.length, '0')
const proxyPage = '<html><body>502 Bad Gateway</body></html>'

// A client every request of which `answer` answers; every URL asked is kept.
function client(answer) {
  const asked = []
  const fetch = async (url) => {
    asked.push(String(url))
    return answer()
  }
  return {
    asked,
    ads: createGoogleAdsClient({ developerToken: 'journey-developer-token', accessToken: 'journey-token', fetch }),
  }
}
const row = (id) => ({ campaign: { id, name: `campaign ${id}`, status: 'ENABLED' }, metrics: { clicks: id } })

const observed = []
const registered = []
const completed = []
function journey(name, body) {
  registered.push(name)
  test(name, async () => {
    await body()
    completed.push(name)
  })
}

journey('every batch of a searchStream answer is read', async () => {
  const { asked, ads } = client(() => Response.json([{ results: [row('a'), row('b')] }, { results: [row('c')] }]))
  const campaigns = await ads.listCampaigns(CUSTOMER, {})
  assert.deepEqual(campaigns.map(({ id }) => id), ['a', 'b', 'c'])
  observed.push({ case: 'batches', asked, rows: campaigns.length })
})

journey('an answer that is not JSON is refused with its status, cause and text', async () => {
  for (const status of [http.HTTP_STATUS_OK, http.HTTP_STATUS_BAD_GATEWAY]) {
    const { ads } = client(() => new Response(proxyPage, { status }))
    await assert.rejects(ads.listCampaigns(CUSTOMER, {}), (error) => {
      assert.ok(error.message.startsWith(
        `Google Ads API returned HTTP ${status} with a body that is not JSON (`), error.message)
      assert.ok(error.message.endsWith(`: ${proxyPage}`), error.message)
      observed.push({ case: 'not JSON', status, error: error.message })
      return true
    })
  }
})

journey('a refusal is its error.message, or its status and whole body', async () => {
  const stated = 'Request had invalid authentication credentials.'
  const withMessage = client(() => Response.json({ error: { message: stated } }, { status: http.HTTP_STATUS_UNAUTHORIZED }))
  await assert.rejects(withMessage.ads.listAccessibleCustomers(), { message: stated })
  const body = JSON.stringify({ error: { status: 'PERMISSION_DENIED' } })
  const without = client(() => new Response(body, { status: http.HTTP_STATUS_FORBIDDEN }))
  await assert.rejects(without.ads.listAccessibleCustomers(), {
    message: `Google Ads API returned HTTP ${http.HTTP_STATUS_FORBIDDEN}: ${body}`,
  })
  observed.push({ case: 'refusals', stated, body })
})

journey('search terms are read with their campaign and ad group, a non-numeric campaign refused', async () => {
  const term = (text, clicks) => ({
    searchTermView: { searchTerm: text, status: 'NONE' },
    campaign: { id: CUSTOMER, name: 'brand' },
    adGroup: { id: CUSTOMER, name: 'exact' },
    metrics: { clicks },
  })
  const { asked, ads } = client(() => Response.json([{ results: [term('wisent pricing', CUSTOMER), term('free wisent', CUSTOMER)] }]))
  const [today] = new Date().toISOString().split('T')
  const terms = await ads.searchTerms(CUSTOMER, today, today, CUSTOMER)
  assert.deepEqual(terms.map(({ searchTerm }) => searchTerm), ['wisent pricing', 'free wisent'])
  const [first] = terms
  assert.equal(first.status, 'none')
  assert.equal(first.adGroupName, 'exact')
  assert.equal(first.conversions, null, 'a metric the answer omits is null')
  const sent = asked.length
  await assert.rejects(ads.searchTerms(CUSTOMER, today, today, 'brand'), /campaignId must be the campaign's numeric id/u)
  assert.equal(asked.length, sent, 'the refused campaign id sent no request')
  observed.push({ case: 'search terms', asked, rows: terms.length })
})

journey('budgets are read with their campaign, a field the answer omits null', async () => {
  const { ads } = client(() => Response.json([{ results: [{
    campaign: { id: CUSTOMER, name: 'brand', status: 'ENABLED' },
    campaignBudget: { id: CUSTOMER, name: 'daily', amountMicros: CUSTOMER, deliveryMethod: 'STANDARD', explicitlyShared: false },
  }] }]))
  const [budget] = await ads.listBudgets(CUSTOMER)
  assert.equal(budget.campaignName, 'brand')
  assert.equal(budget.amountMicros, Number(CUSTOMER))
  assert.equal(budget.deliveryMethod, 'standard')
  assert.equal(budget.shared, false, 'a budget the answer states unshared is not null')
  assert.equal(budget.totalAmountMicros, null, 'a total the answer omits is null')
  observed.push({ case: 'budgets', budget })
})

journey('keywords are read with match type and quality score, a non-numeric campaign refused', async () => {
  const { asked, ads } = client(() => Response.json([{ results: [{
    adGroupCriterion: { criterionId: CUSTOMER, keyword: { text: 'wisent pricing', matchType: 'PHRASE' }, status: 'ENABLED', qualityInfo: { qualityScore: CUSTOMER } },
    campaign: { id: CUSTOMER, name: 'brand' },
    adGroup: { id: CUSTOMER, name: 'pricing' },
    metrics: { clicks: CUSTOMER },
  }] }]))
  const [today] = new Date().toISOString().split('T')
  const [keyword] = await ads.keywords(CUSTOMER, today, today)
  assert.equal(keyword.keyword, 'wisent pricing')
  assert.equal(keyword.matchType, 'phrase')
  assert.equal(keyword.qualityScore, Number(CUSTOMER))
  assert.equal(keyword.conversions, null, 'a metric the answer omits is null')
  const sent = asked.length
  await assert.rejects(ads.keywords(CUSTOMER, today, today, 'brand'), /campaignId must be the campaign's numeric id/u)
  assert.equal(asked.length, sent, 'the refused campaign id sent no request')
  observed.push({ case: 'keywords', asked, keyword })
})

journey('wasted spend is the terms that cost and converted nothing, an unstated one named apart', async () => {
  const spend = String(CUSTOMER.length)
  const term = (text, metrics, status = 'NONE') => ({ searchTermView: { searchTerm: text, status }, campaign: { id: CUSTOMER }, metrics })
  const { ads } = client(() => Response.json([{ results: [
    term('free wisent', { costMicros: spend, conversions: String(spend - spend) }),
    term('wisent pricing', { costMicros: spend, conversions: spend }),
    term('wisent jobs', { costMicros: spend, conversions: String(spend - spend) }, 'EXCLUDED'),
    term('wisent login', { conversions: String(spend - spend) }),
  ] }]))
  const [today] = new Date().toISOString().split('T')
  const waste = await ads.wasted(CUSTOMER, today, today)
  assert.deepEqual(waste.terms.map(({ searchTerm }) => searchTerm), ['free wisent'], 'converted and excluded terms are not waste')
  assert.equal(waste.costMicros, Number(spend))
  assert.deepEqual(waste.unknown, ['wisent login'], 'a term whose cost is not stated is named apart')
  observed.push({ case: 'wasted', waste })
})

journey('pacing holds each campaign\'s spend to its daily budget over the days, the hottest first', async () => {
  const daily = CUSTOMER.length
  const results = [
    { campaign: { id: 'hot', name: 'hot', status: 'ENABLED' }, campaignBudget: { amountMicros: String(daily) }, metrics: { costMicros: String(daily * daily) } },
    { campaign: { id: 'cold', name: 'cold', status: 'ENABLED' }, campaignBudget: { amountMicros: String(daily) }, metrics: { costMicros: String(daily) } },
    { campaign: { id: 'total', name: 'total', status: 'ENABLED' }, campaignBudget: { totalAmountMicros: String(daily) }, metrics: { costMicros: String(daily) } },
  ]
  const { ads } = client(() => Response.json([{ results }]))
  const [today] = new Date().toISOString().split('T')
  const pace = await ads.pacing(CUSTOMER, today, today)
  assert.deepEqual(pace.map(({ campaignId }) => campaignId), ['hot', 'cold', 'total'], 'the hottest first, the unpaceable last')
  const [hot, cold, total] = pace
  assert.equal(hot.days, Number(Boolean(today)), 'one day from a date to itself')
  assert.equal(hot.pace, daily, 'spent the budget of that many days in one')
  assert.equal(cold.pace, Number(Boolean(today)), 'spent exactly its one day')
  assert.equal(total.pace, null, 'a total budget has no daily allowance')
  // The Unix epoch's day, long before today: a range ending before it starts.
  const [epoch] = new Date(today.length - today.length).toISOString().split('T')
  await assert.rejects(ads.pacing(CUSTOMER, today, epoch), /the first not after the second/u)
  observed.push({ case: 'pacing', pace })
})

after(() => {
  if (!defectId || completed.length !== registered.length) return
  const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
  const out = join(root, '.build', 'real-tests', 'api-answers', new Date().toISOString().replace(/[:.]/g, ''))
  mkdirSync(out, { recursive: true })
  const path = join(out, 'criterion.json')
  writeFileSync(path, `${JSON.stringify({
    defectId,
    criterion,
    sourceRevision: revision,
    result: 'passed',
    binarySha256: digest(process.execPath),
    testSha256: digest(fileURLToPath(import.meta.url)),
    observedFinalState: { cases: completed, observed },
    commands,
  }, null, '  ')}\n`, { mode: constants.S_IRUSR | constants.S_IWUSR })
  console.log(`criterion report: ${path}`)
})
