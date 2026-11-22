import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Use an available Playwright installation without adding an application dependency.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.CAMPUS360_URL || 'http://127.0.0.1:8080'
const evidence = process.env.CAMPUS360_EVIDENCE_DIR
const password = process.env.CAMPUS360_TEST_PASSWORD
assert.ok(password, 'CAMPUS360_TEST_PASSWORD is required')
let browser

before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  })
  if (evidence) await mkdir(evidence, { recursive: true })
})
after(async () => { await browser?.close() })

async function session(t, email) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 }, locale: 'fr-MA', reducedMotion: 'reduce',
  })
  const writes = [], errors = []
  await context.route('**/api/v1/**', route => {
    const request = route.request()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
        new URL(request.url()).pathname !== '/api/v1/auth/session') {
      writes.push(request.method() + ' ' + request.url())
      return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => errors.push(error.message))
  t.after(async () => {
    await context.close()
    assert.deepEqual(writes, [], 'Regression must not submit business mutations')
    assert.deepEqual(errors, [], 'No uncaught React/browser errors')
  })
  if (email) {
    await page.goto(base + '/#/login')
    await page.getByLabel('Adresse universitaire', { exact: true }).fill(email)
    await page.getByLabel('Mot de passe', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Connexion', exact: true }).click()
    await page.waitForFunction(() => !location.hash.startsWith('#/login'))
  }
  return { page, context }
}

async function get(context, path) {
  const response = await context.request.get(base + '/api/v1' + path)
  assert.equal(response.status(), 200, path)
  return response.json()
}

async function capture(page, name) {
  if (evidence) await page.screenshot({ path: join(evidence, name + '.png'), fullPage: true })
}

async function openPreview(page, event) {
  const row = page.getByRole('row').filter({ hasText: event.titre })
  const button = row.getByRole('button', { name: 'Consulter les détails', exact: true })
  await button.click()
  const preview = page.locator('#event-preview-' + event.id)
  await preview.waitFor()
  assert.equal(await page.locator('#event-preview-toggle-' + event.id).getAttribute('aria-expanded'), 'true')
  for (const value of [event.titre, event.description, event.categorie, event.lieu, event.organisateur]) {
    assert.ok((await preview.innerText()).includes(value), 'Preview contains ' + value)
  }
  for (const label of ['Début', 'Fin', 'Capacité et inscriptions', 'Places restantes']) {
    assert.equal(await preview.locator('dt').filter({ hasText: label }).count(), 1)
  }
  assert.equal(await preview.locator('input, select, textarea, [contenteditable=true]').count(), 0)
  return preview
}

test('US06: real draft and published previews use admin data without fetching private public details', async t => {
  const { page, context } = await session(t, 'admin@usms.ma')
  const events = await get(context, '/admin/events')
  const publicDetailRequests = []
  page.on('request', request => {
    if (/\/api\/v1\/events\/[0-9a-f-]+$/.test(new URL(request.url()).pathname))
      publicDetailRequests.push(request.url())
  })
  await page.goto(base + '/#/admin/events')
  for (const status of ['BROUILLON', 'PUBLIE']) {
    const event = events.find(event => event.statut === status)
    assert.ok(event, 'Existing demo event for ' + status)
    await page.locator('.management-toolbar select').selectOption(status)
    const preview = await openPreview(page, event)
    await capture(page, 'admin-' + status.toLowerCase() + '-preview')
    if (status === 'BROUILLON') {
      assert.equal((await context.request.get(base + '/api/v1/events/' + event.id)).status(), 404)
      assert.equal(await page.getByRole('button', { name: 'Valider', exact: true }).count(), 1)
    } else {
      assert.ok(await page.getByRole('button', { name: 'Suspendre', exact: true }).count())
    }
    await preview.getByRole('button', { name: 'Fermer l’aperçu', exact: true }).click()
    assert.equal(await preview.count(), 0)
    assert.equal(await page.locator('#event-preview-toggle-' + event.id).evaluate(el => el === document.activeElement), true)
  }
  assert.deepEqual(publicDetailRequests, [], 'Preview must only use the authorized admin list')
})

test('US06: SUSPENDU preview and restore control (controlled response; no event state mutation)', async t => {
  const { page, context } = await session(t, 'admin@usms.ma')
  const events = await get(context, '/admin/events')
  const event = { ...events.find(event => event.statut === 'BROUILLON'), statut: 'SUSPENDU' }
  assert.ok(event.id)
  await page.route('**/api/v1/admin/events', route => route.fulfill({ json: [event] }))
  await page.goto(base + '/#/admin/events')
  await page.reload()
  await page.locator('.management-toolbar select').selectOption('SUSPENDU')
  const preview = await openPreview(page, event)
  assert.ok((await preview.innerText()).includes('Suspendu'))
  assert.equal(await page.getByRole('button', { name: 'Rétablir', exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Retirer du catalogue', exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Valider', exact: true }).count(), 0)
  await capture(page, 'admin-suspended-preview-controlled-response')
})

test('US06: administrator preview stays readable on mobile and tablet', async t => {
  const { page, context } = await session(t, 'admin@usms.ma')
  const event = (await get(context, '/admin/events')).find(event => event.statut === 'BROUILLON')
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(base + '/#/admin/events')
    await page.locator('.management-toolbar select').selectOption('BROUILLON')
    const preview = await openPreview(page, event)
    const box = await preview.boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= width, 'Preview fits viewport ' + width)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await capture(page, 'admin-preview-' + width)
    await preview.getByRole('button', { name: 'Fermer l’aperçu', exact: true }).click()
  }
})

for (const email of ['etudiant@usms.ma', 'annonceur@usms.ma']) {
  test('Admin preview remains inaccessible to ' + email, async t => {
    const { page, context } = await session(t, email)
    assert.equal((await context.request.get(base + '/api/v1/admin/events')).status(), 403)
    assert.equal((await context.request.get(base + '/api/v1/admin/clubs')).status(), 403)
    await page.goto(base + '/#/admin/events')
    await page.getByRole('heading', { name: 'Page indisponible', exact: true }).waitFor()
    assert.equal(await page.locator('.admin-event-preview').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Consulter les détails' }).count(), 0)
  })
}

test('Admin clubs: current assignments appear on the real card and editor without granting membership management', async t => {
  const { page, context } = await session(t, 'admin@usms.ma')
  const clubs = await get(context, '/admin/clubs')
  assert.ok(clubs.every(club => Array.isArray(club.responsables)))
  const club = clubs.find(club => club.responsables.length > 0)
  assert.ok(club)
  assert.equal((await context.request.get(base + '/api/v1/clubs/' + club.id + '/memberships')).status(), 403)
  await page.goto(base + '/#/admin/clubs')
  const card = page.locator('.admin-club-card').filter({ has: page.getByRole('heading', { name: club.nomClub, exact: true }) })
  await card.getByRole('region', { name: 'Responsables actuels', exact: true }).waitFor()
  for (const manager of club.responsables) {
    assert.ok((await card.innerText()).includes(manager.prenom + ' ' + manager.nom))
    assert.ok((await card.innerText()).includes(manager.email))
    assert.deepEqual(Object.keys(manager).sort(), ['email', 'id', 'nom', 'prenom'])
  }
  await card.getByRole('button', { name: 'Modifier / nommer un responsable', exact: true }).click()
  const editor = page.locator('.admin-editor')
  await editor.getByRole('region', { name: 'Responsables actuels', exact: true }).waitFor()
  for (const manager of club.responsables)
    assert.ok((await editor.innerText()).includes(manager.email))
  await capture(page, 'admin-club-current-managers')
  await page.setViewportSize({ width: 320, height: 900 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await capture(page, 'admin-club-current-managers-320')
})

test('Public club list/detail and anonymous admin access remain unchanged', async t => {
  const { context } = await session(t)
  assert.equal((await context.request.get(base + '/api/v1/admin/clubs')).status(), 401)
  assert.equal((await context.request.get(base + '/api/v1/admin/events')).status(), 401)
  const clubs = await get(context, '/clubs')
  assert.ok(clubs.length)
  assert.ok(clubs.every(club => !Object.hasOwn(club, 'responsables')))
  assert.equal(Object.hasOwn(await get(context, '/clubs/' + clubs[0].id), 'responsables'), false)
})

async function lookupRecovery(page, endpoint, path, kind, onRecovered, screenshot, successData) {
  const releases = []
  const gates = Array.from({ length: 3 }, () => new Promise(resolve => releases.push(resolve)))
  let attempt = 0
  await page.route('**/api/v1' + endpoint, async route => {
    const current = attempt++
    assert.ok(current < 3, 'Only initial lookup plus two retries expected')
    await gates[current]
    if (current < 2)
      return route.fulfill({ status: 503, json: { detail: 'Service temporairement indisponible.' } })
    return successData === undefined ? route.continue() : route.fulfill({json: successData})
  })
  await page.goto(base + '/#' + path)
  const panel = page.locator(kind === 'inscription' ? '.booking-action' : '.club-join')
  const loading = panel.getByRole('status').filter({ hasText: 'Vérification de votre ' + kind })
  const error = panel.getByRole('alert').filter({ hasText: 'Impossible de vérifier votre ' + kind })
  const actions = panel.getByRole('button').filter({ hasText: /S’inscrire|Annuler mon inscription|Rejoindre le club|Membre|En attente/ })
  for (let i = 0; i < 3; i++) {
    await loading.waitFor()
    assert.equal(await actions.count(), 0, 'No participation action before successful lookup')
    assert.equal(await error.count(), 0, 'Retry replaces old error with loading')
    releases[i]()
    if (i < 2) {
      await error.waitFor()
      assert.equal(await actions.count(), 0, 'Failure is not evidence of no participation')
      assert.ok((await error.innerText()).includes('Service temporairement indisponible.'))
      if (i === 0) await capture(page, screenshot + '-error')
      await error.getByRole('button', { name: 'Réessayer', exact: true }).click()
    }
  }
  await onRecovered(panel)
  assert.equal(await loading.count(), 0)
  assert.equal(await error.count(), 0)
  assert.equal(attempt, 3)
  await capture(page, screenshot + '-recovered')
}

test('Registration lookup: failure/retry preserves confirmed participation', async t => {
  const { page, context } = await session(t, 'etudiant@usms.ma')
  const registration = (await get(context, '/me/registrations')).find(row => row.statut === 'CONFIRMEE' && row.evenement.statut === 'PUBLIE')
  assert.ok(registration, 'Existing confirmed participation required')
  await lookupRecovery(page, '/me/registrations', '/events/' + registration.evenementId, 'inscription',
    panel => panel.getByRole('button', { name: 'Annuler mon inscription', exact: true }).waitFor(), 'registration-status')
})

test('Registration lookup: CTA appears only after successfully confirming absence', async t => {
  const { page, context } = await session(t, 'etudiant@usms.ma')
  const registrations = await get(context, '/me/registrations')
  const event = (await get(context, '/events')).find(event => !event.passe && event.placesRestantes > 0 && !registrations.some(row => row.evenementId === event.id && row.statut === 'CONFIRMEE'))
  assert.ok(event)
  await lookupRecovery(page, '/me/registrations', '/events/' + event.id, 'inscription',
    panel => panel.getByRole('button', { name: 'S’inscrire', exact: true }).waitFor(), 'registration-absence')
})

test('Membership lookup: failure/retry preserves accepted membership', async t => {
  const { page, context } = await session(t, 'etudiant@usms.ma')
  const club = (await get(context, '/me/memberships')).find(row => row.statut === 'ACCEPTE' && row.statutActif)
  assert.ok(club)
  await lookupRecovery(page, '/me/memberships', '/clubs/' + club.clubId, 'adhésion', async panel => {
    const member = panel.getByRole('button', { name: 'Membre', exact: true })
    await member.waitFor()
    assert.equal(await member.isDisabled(), true)
  }, 'membership-status')
})

test('Membership lookup: join appears only after successfully confirming absence', async t => {
  const { page, context } = await session(t, 'etudiant@usms.ma')
  // The retained demo student manages every club. Absence is a controlled lookup fixture.
  const club = (await get(context, '/clubs'))[0]
  assert.ok(club)
  await lookupRecovery(page, '/me/memberships', '/clubs/' + club.id, 'adhésion',
    panel => panel.getByRole('button', { name: 'Rejoindre le club', exact: true }).waitFor(), 'membership-absence', [])
})
