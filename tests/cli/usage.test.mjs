// A wrong invocation of the googleads CLI is misuse: it exits 2 with the
// usage and reads no credential. Every case runs src/cli.js as a user would
// and names a credentials file open to group and others, which the CLI
// refuses with exit 1 whenever it reads it (the last case shows that
// refusal); so a case that exits 2 without naming the file never reached the
// credential. --help prints the usage on standard output and exits 0.
//
// A defect register that measures a repair by this run names the defect and
// its criterion in GOOGLEADS_TEST_DEFECT and GOOGLEADS_TEST_CRITERION; when
// every case passes on committed source the run writes criterion.json under
// .build/real-tests/cli-usage/<stamp>/: the revision, the digests of the Node
// binary and of this test, and every CLI run with its arguments, exit status
// and standard error as observed final state.
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

// The shell's status for success (https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html).
const SUCCEEDED = 0

const commands = []
const runs = []

function git(...args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, SUCCEEDED, run.stderr)
  commands.push({ executable: 'git', args, exit: run.status })
  return run.stdout
}

const revision = git('rev-parse', 'HEAD').trim()
const uncommitted = git('status', '--porcelain', '--', 'src', 'tests/cli')
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

const OWNER_ONLY = constants.S_IRUSR | constants.S_IWUSR
const OPEN = join(scratch, `${randomUUID()}.json`)
writeFileSync(OPEN, JSON.stringify({ 'google-ads': { developer_token: 'never-read', access_token: 'never-read' } }))
chmodSync(OPEN, OWNER_ONLY | constants.S_IRGRP | constants.S_IROTH)
const CREDENTIAL = [
  '--developer-token', 'google-ads#developer_token',
  '--access-token', 'google-ads#access_token',
  '--credentials-file', OPEN,
]

function misuse(run, message) {
  assert.equal(run.status, MISUSE, run.stderr)
  assert.ok(run.stderr.startsWith(message), run.stderr)
  assert.match(run.stderr, /Usage:/)
  assert.ok(!run.stderr.includes(OPEN), 'the credentials file was never read')
  assert.equal(run.stdout, '')
}

check('an unknown command exits 2 with the usage before any credential is read', () => {
  misuse(googleads('nonsense', ...CREDENTIAL), 'Unknown command: nonsense')
})

check('an option the command does not take exits 2 naming it', () => {
  misuse(googleads('accounts', ...CREDENTIAL, '--gaql', 'x'), 'googleads accounts does not take --gaql')
})

check('an option without its value exits 2', () => {
  misuse(googleads('campaigns', ...CREDENTIAL, '--customer'), '--customer needs a value')
})

check('a valued option given twice exits 2', () => {
  misuse(googleads('campaigns', ...CREDENTIAL, '--customer', 'a', '--customer', 'b'), '--customer may be supplied only once')
})

check('a missing required option exits 2 naming it', () => {
  misuse(googleads('query', ...CREDENTIAL, '--customer', 'a'), 'googleads query requires --gaql')
})

check('--help prints the usage on standard output and exits 0', () => {
  const run = googleads('--help')
  assert.equal(run.status, SUCCEEDED, run.stderr)
  assert.ok(run.stdout.startsWith('googleads-cli'), run.stdout)
  assert.match(run.stdout, /Usage:/)
  assert.equal(run.stderr, '')
})

check('the same invocation, once correct, reads the file and refuses it with exit 1', () => {
  const run = googleads('accounts', ...CREDENTIAL)
  assert.equal(run.status, FAILURE, run.stderr)
  assert.ok(run.stderr.includes(OPEN), run.stderr)
})

after(() => {
  if (!defectId || completed.length !== registered.length) return
  const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
  const out = join(root, '.build', 'real-tests', 'cli-usage', new Date().toISOString().replace(/[:.]/g, ''))
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
