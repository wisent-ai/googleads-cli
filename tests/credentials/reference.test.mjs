// The googleads CLI reads its tokens by the role a secret plays: through the
// real `stado` on PATH, or through an owner-only credentials file. Every case
// runs src/cli.js as a user would and reads its exit status and stderr; the
// last sends a file's tokens to the real Google Ads API.
//
// A defect register that measures a repair by this run names the defect and
// its criterion in GOOGLEADS_TEST_DEFECT and GOOGLEADS_TEST_CRITERION; when
// every case passes on committed source the run writes criterion.json under
// .build/real-tests/credentials/<stamp>/: the revision, the digests of the
// Node binary and of this test, and every CLI run with its arguments, exit
// status and standard error as observed final state.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, constants, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = join(root, '.build', 'tests', randomUUID())
mkdirSync(scratch, { recursive: true })
after(() => rmSync(scratch, { recursive: true, force: true }))

const defectId = process.env.GOOGLEADS_TEST_DEFECT?.trim()
const criterion = process.env.GOOGLEADS_TEST_CRITERION?.trim()
assert.equal(Boolean(defectId), Boolean(criterion),
  'GOOGLEADS_TEST_DEFECT and GOOGLEADS_TEST_CRITERION are named together or not at all')

// The shell's statuses for misuse and for failure (https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html).
const MISUSE = 2
const FAILURE = 1 // https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html

const DEVELOPER = 'google-ads#developer_token'
const ACCESS = 'google-ads#access_token'

// The shell's status for success (https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html).
const SUCCEEDED = 0

function git(...args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, SUCCEEDED, run.stderr)
  commands.push({ executable: 'git', args, exit: run.status })
  return run.stdout
}

const commands = []
const runs = []
const revision = git('rev-parse', 'HEAD').trim()
const uncommitted = git('status', '--porcelain', '--', 'src', 'tests/credentials')
assert.ok(!defectId || uncommitted === '', 'commit the CLI and this test before qualification')

function googleads(...args) {
  const run = spawnSync(process.execPath, [join(root, 'src', 'cli.js'), ...args], { encoding: 'utf8' })
  runs.push({ args, exit: run.status, stderr: run.stderr })
  return run
}

const registered = []
const completed = []
function check(name, body) {
  registered.push(name)
  test(name, () => {
    body()
    completed.push(name)
  })
}

function credentialsFile(document, mode) {
  const path = join(scratch, `${randomUUID()}.json`)
  writeFileSync(path, typeof document === 'string' ? document : JSON.stringify(document))
  chmodSync(path, mode)
  return path
}

const OWNER_ONLY = constants.S_IRUSR | constants.S_IWUSR
const WORLD_READABLE = OWNER_ONLY | constants.S_IRGRP | constants.S_IROTH

check('a reference that is not ROLE#FIELD is misuse, refused before any read', () => {
  for (const reference of ['google-ads', 'google-ads#', '#access_token', 'a#b#c']) {
    const run = googleads('accounts', '--developer-token', DEVELOPER, '--access-token', reference)
    assert.equal(run.status, MISUSE, run.stderr)
    assert.match(run.stderr, /--access-token must be a credential reference ROLE#FIELD/)
    assert.ok(run.stderr.includes(JSON.stringify(reference)), run.stderr)
  }
})

check('a role no secret plays is refused with Stado naming the role', () => {
  const role = `googleads-cli-absent-${randomUUID()}`
  const run = googleads('accounts', '--developer-token', `${role}#developer_token`, '--access-token', ACCESS)
  assert.equal(run.status, FAILURE, run.stderr)
  assert.ok(run.stderr.includes(`stado credentials get --role ${role} --field developer_token failed`), run.stderr)
  assert.ok(run.stderr.includes(`stado:role:${role}`), run.stderr)
})

check('a credentials file open to group or others is refused before it is read', () => {
  const path = credentialsFile({ 'google-ads': { developer_token: 'unused', access_token: 'unused' } }, WORLD_READABLE)
  const run = googleads('accounts', '--developer-token', DEVELOPER, '--access-token', ACCESS, '--credentials-file', path)
  assert.equal(run.status, FAILURE, run.stderr)
  assert.ok(run.stderr.includes(`--credentials-file ${path} is open to group or others`), run.stderr)
})

check('a credentials file without the role, the field or a string value is refused by name', () => {
  const cases = [
    ['not json', /is not JSON/],
    [['google-ads'], /must hold a JSON object of roles/],
    [{ other: { developer_token: 'unused' } }, /--developer-token: .* has no role google-ads/],
    [{ 'google-ads': { developer_token: 'unused' } }, /--access-token: .* role google-ads has no field access_token/],
    [{ 'google-ads': { developer_token: 'unused', access_token: null } }, /field access_token is not a non-empty string/],
  ]
  for (const [document, refusal] of cases) {
    const path = credentialsFile(document, OWNER_ONLY)
    const run = googleads('accounts', '--developer-token', DEVELOPER, '--access-token', ACCESS, '--credentials-file', path)
    assert.equal(run.status, FAILURE, run.stderr)
    assert.match(run.stderr, refusal)
  }
})

check("an owner-only file's tokens are sent to Google Ads, and its refusal of them is reported", () => {
  const token = `googleads-cli-invalid-${randomUUID()}`
  const path = credentialsFile({ 'google-ads': { developer_token: token, access_token: token } }, OWNER_ONLY)
  const run = googleads('accounts', '--developer-token', DEVELOPER, '--access-token', ACCESS, '--credentials-file', path)
  assert.equal(run.status, FAILURE, run.stderr)
  assert.match(run.stderr, /invalid authentication credentials/i)
  assert.ok(!run.stderr.includes(token) && !run.stdout.includes(token), 'the tokens never reach output')
})

after(() => {
  if (!defectId || completed.length !== registered.length) return
  const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
  const out = join(root, '.build', 'real-tests', 'credentials', new Date().toISOString().replace(/[:.]/g, ''))
  mkdirSync(out, { recursive: true })
  const path = join(out, 'criterion.json')
  writeFileSync(path, `${JSON.stringify({
    defectId,
    criterion,
    sourceRevision: revision,
    result: 'passed',
    binarySha256: digest(process.execPath),
    testSha256: digest(fileURLToPath(import.meta.url)),
    observedFinalState: { cases: completed, runs },
    commands,
  }, null, '  ')}\n`, { mode: OWNER_ONLY })
  console.log(`criterion report: ${path}`)
})
