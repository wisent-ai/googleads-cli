// How the Google Ads client reads API answers. createGoogleAdsClient takes the
// fetch it sends requests through as an input; the journey hands it one that
// answers with a real Response of the shape the Google Ads API, or a proxy in
// front of it, sends, and checks that:
//   - a searchStream answer's rows, across every batch, are returned;
//   - an answer that is not JSON is refused with its status, the parse cause
//     and the text, never read as no data;
//   - a refusal carrying error.message is reported as that message, and one
//     without it with its status and whole body.
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
