import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const base = process.env.CAMPUS360_URL
const mailbox = process.env.MAILPIT_URL
const compose = process.env.CAMPUS360_TEST_COMPOSE
const project = process.env.CAMPUS360_TEST_PROJECT
const out = process.env.CAMPUS360_EVIDENCE_DIR
assert.equal(process.env.CAMPUS360_ISOLATED_ACCEPTANCE, '1', 'Explicit isolated-test opt-in required')
assert.equal(new URL(base).port, '18080', 'Never run these fixtures against the demonstration ports')
assert.equal(new URL(mailbox).port, '18025', 'Use only isolated Mailpit')
assert.ok(project?.startsWith('campus360-acceptance-') && compose && out)
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright')
const password = process.env.CAMPUS360_TEST_PASSWORD
assert.ok(password, 'CAMPUS360_TEST_PASSWORD is required')
const tag = `acceptance-${Date.now()}`
const results = [], apiEvidence = [], databaseEvidence = [], actors = []
const statuses = new Map()
let browser, admin, manager, otherManager, alice, bob, visitor, clubA, clubB, event, registration, pastEvent

async function save(name, value) {
  await writeFile(join(out, name), JSON.stringify(value, null, 2), 'utf8')
}

function sqlUUID(value) {
  assert.match(value, /^[0-9a-f-]{36}$/i)
  return `'${value}'`
}

function sql(statement) {
  // This compose project has an independent ephemeral PostgreSQL instance.
  return execFileSync('docker', ['compose', '-f', compose, '-p', project, 'exec', '-T',
    'database', 'psql', '-q', '-U', 'campus360', '-d', 'campus360', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement],
  { encoding: 'utf8', windowsHide: true }).trim()
}

function db(label, statement) {
  assert.ok(statement.startsWith('SELECT '), 'Database evidence queries are read-only')
  const value = JSON.parse(sql(statement) || 'null')
  databaseEvidence.push({ label, statement, value })
  return value
}

function membershipState(student, club, label) {
  return db(label, `SELECT COALESCE(json_agg(a), '[]') FROM (SELECT id, etudiant_id, club_id, statut, role_dans_club FROM adhesion_club WHERE etudiant_id = ${sqlUUID(student.user.id)} AND club_id = ${sqlUUID(club.id)}) a`)
}

function registrationState(label) {
  return db(label, `SELECT row_to_json(r) FROM inscription r WHERE r.id = ${sqlUUID(registration.id)}`)
}

function eventState(label) {
  return db(label, `SELECT json_build_object('statut', e.statut, 'capaciteMax', e.capacite_max, 'confirmed', (SELECT count(*) FROM inscription r WHERE r.evenement_id = e.id AND r.statut = 'CONFIRMEE')) FROM evenement e WHERE e.id = ${sqlUUID(event.id)}`)
}

async function call(actor, method, path, body, status = 200) {
  const headers = {}
  if (method !== 'GET') {
    const token = await actor.context.request.get(base + '/api/v1/auth/csrf')
    assert.equal(token.status(), 200)
    headers['X-XSRF-TOKEN'] = (await token.json()).token
  }
  const response = await actor.context.request.fetch(base + '/api/v1' + path, { method, data: body, headers })
  const data = await response.json().catch(() => null)
  apiEvidence.push({ actor: actor.name, method, path, status: response.status(), data })
  assert.equal(response.status(), status, `${actor.name} ${method} ${path}: ${JSON.stringify(data)}`)
  return data
}

async function actor(name, email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 },
    timezoneId: 'Africa/Casablanca', locale: 'fr-MA', reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const state = { name, email, context, page, errors: [], requests: [] }
  page.on('pageerror', error => state.errors.push(error.message))
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.pathname.startsWith('/api/v1/'))
      state.requests.push({ method: response.request().method(), path: url.pathname, status: response.status() })
  })
  actors.push(state)
  return state
}

async function login(who) {
  await visit(who, '/login')
  await who.page.getByLabel('Adresse universitaire', { exact: true }).fill(who.email)
  await who.page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await who.page.getByRole('button', { name: 'Connexion', exact: true }).click()
  await who.page.waitForFunction(() => !location.hash.startsWith('#/login'))
  who.user = await call(who, 'GET', '/me')
}

async function visit(who, path) {
  const url = base + '/#' + path
  if (who.page.url() === url) await who.page.reload()
  else await who.page.goto(url)
}

async function screen(who, name) {
  await who.page.locator('.resource-loading').waitFor({ state: 'hidden' })
  await who.page.screenshot({ path: join(out, name + '.png'), fullPage: true })
}

async function clickResponse(who, method, path, control, status) {
  const [actual] = await Promise.all([
    who.page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1' + path && response.request().method() === method),
    control.click(),
  ])
  const data = await actual.json().catch(() => null)
  apiEvidence.push({ actor: who.name, method, path, status: actual.status(), data, throughBrowser: true })
  assert.equal(actual.status(), status, `${method} ${path}: ${JSON.stringify(data)}`)
  return data
}

async function emailFor(recipient, subject, exclude = []) {
  for (let i = 0; i < 50; i++) {
    const listing = await (await fetch(mailbox + '/api/v1/messages?limit=200')).json()
    const found = listing.messages.find(message => !exclude.includes(message.ID) && message.Subject.includes(subject) && message.To.some(to => to.Address === recipient))
    if (found) return (await fetch(mailbox + '/api/v1/message/' + found.ID)).json()
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw Error('Mailpit message not delivered: ' + recipient + ' / ' + subject)
}

async function signup(who, first, expired = false) {
  const p = who.page
  await p.goto(base + '/#/register')
  await p.getByLabel('Prénom', { exact: true }).fill(first)
  await p.getByLabel('Nom', { exact: true }).fill('Acceptation')
  await p.getByLabel('CNE / Apogée (facultatif)', { exact: true }).fill(tag + '-' + first)
  await p.getByLabel('Adresse universitaire', { exact: true }).fill(who.email)
  await p.getByLabel('Mot de passe', { exact: true }).fill(password)
  await clickResponse(who, 'POST', '/auth/register', p.getByRole('button', { name: 'Créer mon compte', exact: true }), 201)
  await p.waitForURL('**/#/verify')
  const firstMessage = await emailFor(who.email, 'Vérifiez')
  let code = firstMessage.Text.match(/\b[0-9]{6}\b/)[0]
  if (expired) {
    const user = (await call(admin, 'GET', '/admin/users?q=' + encodeURIComponent(who.email)))[0]
    assert.ok(user.email.startsWith(tag), 'Only this disposable account may be time-controlled')
    sql(`UPDATE utilisateur SET verification_expires_at = now() - interval '1 minute', verification_sent_at = now() - interval '2 minutes' WHERE id = ${sqlUUID(user.id)}`)
    await p.getByLabel('Code de vérification', { exact: true }).fill(code)
    await clickResponse(who, 'POST', '/auth/verify', p.getByRole('button', { name: 'Vérifier mon adresse', exact: true }), 422)
    await p.getByRole('alert').filter({ hasText: 'Code expiré' }).waitFor()
    await screen(who, 'otp-expired')
    await p.getByLabel('Adresse pour le renvoi', { exact: true }).fill(who.email)
    await clickResponse(who, 'POST', '/auth/verification/resend', p.getByRole('button', { name: 'Renvoyer un code', exact: true }), 202)
    const replacement = await emailFor(who.email, 'Vérifiez', [firstMessage.ID])
    code = replacement.Text.match(/\b[0-9]{6}\b/)[0]
    await save('otp-resend-mailpit.json', { recipient: who.email, firstId: firstMessage.ID, replacementId: replacement.ID, subject: replacement.Subject })
  }
  await p.getByLabel('Code de vérification', { exact: true }).fill(code)
  await clickResponse(who, 'POST', '/auth/verify', p.getByRole('button', { name: 'Vérifier mon adresse', exact: true }), 204)
  await p.waitForURL('**/#/login')
  await login(who)
  assert.equal(who.user.estVerifie, true)
}

async function managerMembers() {
  await visit(manager, '/manage/members')
  await manager.page.getByRole('combobox', { name: 'Mon club', exact: true }).selectOption(clubA.id)
  await manager.page.locator('.resource-loading').waitFor({ state: 'hidden' })
}

async function requestMembership(who, club) {
  await visit(who, '/clubs/' + club.id)
  const membership = await clickResponse(who, 'POST', '/clubs/' + club.id + '/memberships',
    who.page.getByRole('button', { name: 'Rejoindre le club', exact: true }), 201)
  await who.page.getByRole('button', { name: 'En attente', exact: true }).waitFor()
  assert.equal(membership.statut, 'EN_ATTENTE')
  return membership
}

test('Isolated end-to-end acceptance: real memberships, confirmation and conditional states', { timeout: 240000 }, async t => {
  await mkdir(out, { recursive: true })
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) })
  t.after(async () => {
    await save('targeted-results.json', { tag, base, mailbox, results })
    await save('api-evidence.json', apiEvidence)
    await save('database-evidence.json', databaseEvidence)
    await save('browser-evidence.json', actors.map(who => ({ actor: who.name, email: who.email, finalUrl: who.page.url(), errors: who.errors, requests: who.requests })))
    await save('fixtures.json', { tag, clubA, clubB, event, registration, students: [alice, bob].filter(Boolean).map(who => ({ email: who.email, id: who.user?.id })) })
    await browser.close()
  })
  async function scenario(id, title, fn, prerequisites = []) {
    await t.test(id + ' - ' + title, async sub => {
      if (prerequisites.some(id => statuses.get(id) !== 'PASS')) {
        statuses.set(id, 'NOT VERIFIED')
        results.push({ id, title, status: 'NOT VERIFIED', reason: 'Prerequisite failed', prerequisites })
        sub.skip('Prerequisite failed')
        return
      }
      try {
        await fn()
        statuses.set(id, 'PASS')
        results.push({ id, title, status: 'PASS' })
      } catch (error) {
        statuses.set(id, 'FAIL')
        results.push({ id, title, status: 'FAIL', error: error.message })
        for (const who of actors) await who.page.screenshot({ path: join(out, 'failure-' + id + '-' + who.name + '.png'), fullPage: true }).catch(() => {})
        throw error
      }
    })
  }

  await scenario('SETUP', 'Verified disposable students, official clubs and contextual managers', async () => {
    admin = await actor('admin', 'admin@usms.ma')
    manager = await actor('manager', 'etudiant@usms.ma')
    otherManager = await actor('other-manager', tag + '-manager@usms.ma')
    alice = await actor('alice', tag + '-alice@usms.ma')
    bob = await actor('bob', tag + '-bob@usms.ma')
    visitor = await actor('visitor')
    await login(admin)
    await login(manager)
    await signup(otherManager, 'Manager')
    await signup(alice, 'Alice', true)
    await signup(bob, 'Bob')
    const filteredAccounts = await call(admin, 'GET', '/admin/users?q=' + tag + '&role=ETUDIANT&actif=true')
    assert.equal(filteredAccounts.length, 3)
    assert.ok(filteredAccounts.every(user => user.role === 'ETUDIANT' && user.actif))
    await visit(admin, '/admin/clubs')
    await admin.page.getByRole('button', { name: 'Créer un club', exact: true }).click()
    const editor = admin.page.locator('.admin-editor')
    await editor.getByLabel('Nom du club', { exact: true }).fill(tag + ' Club A')
    await editor.getByLabel('Description', { exact: true }).fill('Club réservé aux scénarios de recette isolée.')
    await editor.getByLabel('Catégorie', { exact: true }).fill('Acceptation')
    await editor.getByLabel('Contact du club', { exact: true }).fill('acceptance@usms.ma')
    await editor.getByLabel('Bureau du club', { exact: true }).fill('Bureau de recette')
    await editor.getByRole('combobox', { name: 'Étudiant responsable', exact: true }).selectOption(manager.user.id)
    clubA = await clickResponse(admin, 'POST', '/admin/clubs', editor.getByRole('button', { name: 'Enregistrer', exact: true }), 201)
    clubB = await call(admin, 'POST', '/admin/clubs', { nomClub: tag + ' Club B', description: 'Autre club isolé', categorie: 'Acceptation', logoUrl: '', statutActif: true, responsableId: otherManager.user.id, contact: '', bureau: '' }, 201)
    assert.equal((await call(manager, 'GET', '/me')).clubs.find(club => club.id === clubA.id).roleDansClub, 'RESPONSABLE')
    await save('setup-identities.json', { alice: alice.user, bob: bob.user, manager: manager.user.id, otherManager: otherManager.user.id })
  })

  await scenario('US11-REQUEST', 'Student requests membership; pending status is persisted and visible', async () => {
    await requestMembership(alice, clubA)
    assert.equal(membershipState(alice, clubA, 'Student request persisted')[0].statut, 'EN_ATTENTE')
    await call(alice, 'POST', '/clubs/' + clubA.id + '/memberships', undefined, 409)
    await screen(alice, 'us11-student-pending')
  }, ['SETUP'])

  await scenario('US11-PENDING', 'Responsible manager sees the pending request and both decision controls', async () => {
    await managerMembers()
    const row = manager.page.getByRole('row').filter({ hasText: alice.email })
    await row.getByRole('button', { name: 'Accepter', exact: true }).waitFor()
    assert.equal(await row.getByRole('button', { name: 'Refuser', exact: true }).count(), 1)
    assert.ok((await row.innerText()).includes('En attente'))
    await screen(manager, 'us11-manager-pending')
  }, ['US11-REQUEST'])

  await scenario('US11-ACCEPT', 'Manager accepts; student sees membership and correct member count', async () => {
    const membership = membershipState(alice, clubA, 'Before acceptance')[0]
    const row = manager.page.getByRole('row').filter({ hasText: alice.email })
    await clickResponse(manager, 'PATCH', `/clubs/${clubA.id}/memberships/${membership.id}`, row.getByRole('button', { name: 'Accepter', exact: true }), 204)
    await row.getByRole('button', { name: 'Retirer', exact: true }).waitFor()
    assert.equal(membershipState(alice, clubA, 'After acceptance')[0].statut, 'ACCEPTE')
    assert.equal((await call(visitor, 'GET', '/clubs/' + clubA.id)).nombreMembres, 2)
    await visit(alice, '/memberships')
    await alice.page.locator('.membership-card').filter({ hasText: clubA.nomClub }).getByText('Membre', { exact: true }).waitFor()
    await screen(alice, 'us11-student-accepted')
    await visit(alice, '/profile')
    await alice.page.getByRole('link', { name: clubA.nomClub, exact: true }).waitFor()
    await screen(alice, 'profile-accepted-club')
  }, ['US11-PENDING'])

  await scenario('US11-REJECT', 'Manager rejects another request; student sees refusal', async () => {
    const membership = await requestMembership(bob, clubA)
    await managerMembers()
    const row = manager.page.getByRole('row').filter({ hasText: bob.email })
    await clickResponse(manager, 'PATCH', `/clubs/${clubA.id}/memberships/${membership.id}`, row.getByRole('button', { name: 'Refuser', exact: true }), 204)
    await row.getByText('Refusée', { exact: true }).waitFor()
    assert.equal(membershipState(bob, clubA, 'After refusal')[0].statut, 'REFUSE')
    assert.equal((await call(visitor, 'GET', '/clubs/' + clubA.id)).nombreMembres, 2)
    await visit(bob, '/memberships')
    await bob.page.locator('.membership-card').filter({ hasText: clubA.nomClub }).getByText('Refusée', { exact: true }).waitFor()
    await screen(bob, 'us11-student-refused')
  }, ['US11-ACCEPT'])

  await scenario('US11-REMOVE', 'Manager removes accepted member; student and database reflect removal', async () => {
    await managerMembers()
    const membership = membershipState(alice, clubA, 'Before removal')[0]
    const row = manager.page.getByRole('row').filter({ hasText: alice.email })
    await clickResponse(manager, 'DELETE', `/clubs/${clubA.id}/memberships/${membership.id}`, row.getByRole('button', { name: 'Retirer', exact: true }), 204)
    await row.waitFor({ state: 'hidden' })
    assert.deepEqual(membershipState(alice, clubA, 'After removal'), [])
    assert.equal((await call(visitor, 'GET', '/clubs/' + clubA.id)).nombreMembres, 1)
    await visit(alice, '/memberships')
    await alice.page.getByText('Aucune demande d’adhésion.', { exact: false }).waitFor()
    await visit(alice, '/clubs/' + clubA.id)
    await alice.page.getByRole('button', { name: 'Rejoindre le club', exact: true }).waitFor()
    await screen(alice, 'us11-student-removed')
  }, ['US11-REJECT'])

  await scenario('US11-SCOPE', 'Managers cannot read, accept, reject or remove requests of other clubs', async () => {
    const membership = await requestMembership(bob, clubB)
    await managerMembers()
    const choices = await manager.page.getByRole('combobox', { name: 'Mon club', exact: true }).locator('option').evaluateAll(options => options.map(o => o.value))
    assert.equal(choices.includes(clubB.id), false)
    await call(manager, 'GET', `/clubs/${clubB.id}/memberships`, undefined, 403)
    for (const statut of ['ACCEPTE', 'REFUSE'])
      await call(manager, 'PATCH', `/clubs/${clubB.id}/memberships/${membership.id}`, { statut }, 403)
    await call(manager, 'DELETE', `/clubs/${clubB.id}/memberships/${membership.id}`, undefined, 403)
    await call(otherManager, 'GET', `/clubs/${clubA.id}/memberships`, undefined, 403)
    await call(alice, 'GET', `/clubs/${clubA.id}/memberships`, undefined, 403)
    assert.equal(membershipState(bob, clubB, 'Foreign request unchanged after forbidden operations')[0].statut, 'EN_ATTENTE')
    await screen(manager, 'us11-manager-scope')
  }, ['US11-REMOVE'])

  await scenario('US23-EVENT', 'Club manager publishes a real one-place event through the three-step form', async () => {
    await visit(manager, '/manage/events/new')
    const p = manager.page
    await p.locator('input[name=titre]').fill(tag + ' Confirmation')
    await p.locator('input[name=categorie]').fill('Acceptation')
    await p.locator('textarea[name=description]').fill('Événement isolé pour vérifier confirmation, capacité et suspension.')
    await p.getByRole('button', { name: 'Suivant', exact: true }).click()
    await p.locator('input[name=lieu]').fill('Salle de recette isolée')
    const day = new Date(Date.now() + 172800000).toISOString().slice(0, 10)
    await p.locator('input[name=dateHeureDebut]').fill(day + 'T14:00')
    await p.locator('input[name=dateHeureFin]').fill(day + 'T16:00')
    await p.locator('input[name=capaciteMax]').fill('1')
    await p.locator('select[name=clubId]').selectOption(clubA.id)
    await p.getByRole('button', { name: 'Suivant', exact: true }).click()
    await p.locator('select[name=statut]').selectOption('PUBLIE')
    await screen(manager, 'event-publication-form')
    event = await clickResponse(manager, 'POST', '/events', p.getByRole('button', { name: 'Publier l’événement', exact: true }), 201)
    assert.equal(event.statut, 'PUBLIE')
    assert.equal(event.clubId, clubA.id)
    assert.equal(event.placesRestantes, 1)
    assert.equal(eventState('Event before registration').confirmed, 0)
  }, ['US11-REMOVE'])

  await scenario('US23-REGISTER', 'Verified non-member registers; recap, record and capacity agree', async () => {
    assert.equal((await call(alice, 'GET', '/me')).estVerifie, true)
    assert.deepEqual(membershipState(alice, clubA, 'No club membership required for event registration'), [])
    await visit(alice, '/events/' + event.id)
    registration = await clickResponse(alice, 'POST', `/events/${event.id}/registrations`, alice.page.getByRole('button', { name: 'S’inscrire', exact: true }), 201)
    assert.equal(registration.statut, 'CONFIRMEE')
    const recap = alice.page.locator('section.success')
    await recap.getByRole('heading', { name: 'Votre inscription est confirmée', exact: true }).waitFor()
    assert.ok((await recap.innerText()).includes(event.titre))
    assert.ok((await recap.innerText()).includes(event.lieu))
    assert.equal(await recap.getByRole('link', { name: 'Voir mes inscriptions', exact: true }).count(), 1)
    const stored = registrationState('Registration persisted after browser submit')
    assert.equal(stored.statut, 'CONFIRMEE')
    assert.equal(stored.etudiant_id, alice.user.id)
    assert.equal(stored.evenement_id, event.id)
    assert.deepEqual(eventState('Capacity after registration'), { statut: 'PUBLIE', capaciteMax: 1, confirmed: 1 })
    assert.equal((await call(visitor, 'GET', '/events/' + event.id)).placesRestantes, 0)
    await screen(alice, 'us23-visible-confirmation')
  }, ['US23-EVENT'])

  await scenario('US23-EMAIL', 'Corresponding confirmation is captured in Mailpit API and browser', async () => {
    const message = await emailFor(alice.email, 'Confirmation')
    assert.ok(message.To.some(to => to.Address === alice.email))
    for (const value of [event.titre, event.lieu, event.dateHeureDebut])
      assert.ok(message.Text.includes(value), 'Confirmation email contains ' + value)
    await save('confirmation-mailpit.json', message)
    const mail = await actor('mailpit')
    await mail.page.goto(mailbox)
    await mail.page.locator('a[href="/view/' + message.ID + '"]').click()
    await mail.page.getByText(message.Subject, { exact: true }).first().waitFor()
    await mail.page.waitForLoadState('networkidle')
    await screen(mail, 'us23-mailpit-confirmation')
  }, ['US23-REGISTER'])

  await scenario('US23-DUPLICATE', 'Duplicate registration is rejected without creating another record', async () => {
    const before = registrationState('Before duplicate request')
    await call(alice, 'POST', `/events/${event.id}/registrations`, undefined, 409)
    assert.deepEqual(registrationState('After rejected duplicate'), before)
    assert.equal(eventState('Duplicate does not consume capacity').confirmed, 1)
  }, ['US23-REGISTER'])

  await scenario('STATE-FULL', 'Full published event stays visible and blocks new registration', async () => {
    await visit(visitor, '/events?q=' + encodeURIComponent(event.titre))
    const card = visitor.page.locator('.event-card').filter({ hasText: event.titre })
    await card.getByText('Complet', { exact: true }).waitFor()
    await screen(visitor, 'full-event-public-catalogue')
    await visit(bob, '/events/' + event.id)
    const full = bob.page.getByRole('button', { name: 'Complet', exact: true })
    await full.waitFor()
    assert.equal(await full.isDisabled(), true)
    await call(bob, 'POST', `/events/${event.id}/registrations`, undefined, 409)
    assert.equal(eventState('Full event keeps publication status').statut, 'PUBLIE')
    await screen(bob, 'full-event-registration-blocked')
    await visit(manager, '/manage/events')
    await manager.page.getByRole('row').filter({ hasText: event.titre }).getByText('Publié', { exact: true }).waitFor()
    await screen(manager, 'full-event-organizer')
  }, ['US23-REGISTER'])

  await scenario('STATE-SUSPEND', 'Real admin suspension hides event and preserves existing registration', async () => {
    const before = registrationState('Before suspension')
    await visit(admin, '/admin/events')
    const row = admin.page.getByRole('row').filter({ hasText: event.titre })
    await clickResponse(admin, 'POST', `/admin/events/${event.id}/suspend`, row.getByRole('button', { name: 'Suspendre', exact: true }), 204)
    await row.getByText('Suspendu', { exact: true }).waitFor()
    assert.equal(eventState('Suspended event in PostgreSQL').statut, 'SUSPENDU')
    assert.deepEqual(registrationState('Registration preserved during suspension'), before)
    assert.equal((await call(visitor, 'GET', '/events')).some(item => item.id === event.id), false)
    await call(visitor, 'GET', '/events/' + event.id, undefined, 404)
    await call(bob, 'POST', `/events/${event.id}/registrations`, undefined, 409)
    await visit(visitor, '/events?q=' + encodeURIComponent(event.titre))
    await visitor.page.getByText('Aucun événement ne correspond.', { exact: true }).waitFor()
    await screen(visitor, 'suspended-event-hidden-catalogue')
    await visit(alice, '/registrations')
    const card = alice.page.locator('.registration-card').filter({ hasText: event.titre })
    await card.getByText('Événement temporairement suspendu.', { exact: false }).waitFor()
    assert.equal(await card.getByRole('link', { name: event.titre, exact: true }).count(), 0)
    await card.getByText('Confirmée', { exact: true }).waitFor()
    await screen(alice, 'suspended-event-student-registration')
    await row.getByRole('button', { name: 'Consulter les détails', exact: true }).click()
    await admin.page.locator('#event-preview-' + event.id).getByText('Suspendu', { exact: true }).waitFor()
    await screen(admin, 'suspended-event-admin-preview-real')
  }, ['STATE-FULL'])

  await scenario('STATE-ORGANIZER', 'Suspended organizer form is readonly for status; non-admin restore forbidden', async () => {
    await visit(manager, '/manage/events?edit=' + event.id)
    await manager.page.locator('.event-wizard').waitFor()
    for (let i = 0; i < 2; i++) await manager.page.getByRole('button', { name: 'Suivant', exact: true }).click()
    const status = manager.page.locator('select[name=statut]')
    assert.equal(await status.inputValue(), 'SUSPENDU')
    assert.equal(await status.isDisabled(), true)
    await manager.page.getByText('Seule l’administration peut rétablir cet événement.', { exact: false }).waitFor()
    await screen(manager, 'suspended-event-organizer-status')
    await call(manager, 'POST', `/admin/events/${event.id}/restore`, undefined, 403)
    await call(alice, 'POST', `/admin/events/${event.id}/restore`, undefined, 403)
    assert.equal(eventState('Forbidden restore leaves suspension unchanged').statut, 'SUSPENDU')
  }, ['STATE-SUSPEND'])

  await scenario('STATE-RESTORE', 'Admin restores real suspended event; full state and registration survive', async () => {
    const before = registrationState('Before restoration')
    const row = admin.page.getByRole('row').filter({ hasText: event.titre })
    await clickResponse(admin, 'POST', `/admin/events/${event.id}/restore`, row.getByRole('button', { name: 'Rétablir', exact: true }), 204)
    await row.getByText('Publié', { exact: true }).waitFor()
    const restored = await call(visitor, 'GET', '/events/' + event.id)
    assert.equal(restored.statut, 'PUBLIE')
    assert.equal(restored.disponibilite, 'COMPLET')
    assert.equal((await call(visitor, 'GET', '/events')).some(item => item.id === event.id), true)
    assert.deepEqual(registrationState('Registration preserved after restoration'), before)
    await screen(admin, 'restored-event-admin-real')
    await visit(bob, '/events/' + event.id)
    const full = bob.page.getByRole('button', { name: 'Complet', exact: true })
    await full.waitFor()
    assert.equal(await full.isDisabled(), true)
  }, ['STATE-ORGANIZER'])

  await scenario('US23-CANCEL', 'Cancellation releases place and updates student registrations and planning', async () => {
    await visit(alice, '/registrations')
    const card = alice.page.locator('.registration-card').filter({ hasText: event.titre })
    await clickResponse(alice, 'DELETE', '/me/registrations/' + registration.id,
      card.getByRole('button', { name: 'Annuler mon inscription', exact: true }), 204)
    await card.getByText('Annulée', { exact: true }).waitFor()
    assert.equal(registrationState('Cancellation persisted').statut, 'ANNULEE')
    assert.equal(eventState('Cancellation frees capacity').confirmed, 0)
    const released = await call(visitor, 'GET', '/events/' + event.id)
    assert.equal(released.placesRestantes, 1)
    assert.equal(released.disponibilite, 'OUVERT')
    await visit(alice, '/planning')
    await alice.page.locator('.registration-card').filter({ hasText: event.titre }).getByText('Annulée', { exact: true }).waitFor()
    await screen(alice, 'cancelled-registration-planning')
    await visit(bob, '/events/' + event.id)
    const register = bob.page.getByRole('button', { name: 'S’inscrire', exact: true })
    await register.waitFor()
    assert.equal(await register.isEnabled(), true)
    await screen(bob, 'released-place-available')
  }, ['STATE-RESTORE'])

  await scenario('US18-FILTERS', 'Combined filters, empty result and reset work with live fixture', async () => {
    await visit(visitor, '/events')
    await visitor.page.locator('input[name=q]:not([type=search])').fill(event.titre)
    await visitor.page.locator('select[name=categorie]').selectOption(event.categorie)
    await visitor.page.locator('input[name=date]').fill(event.dateHeureDebutCampus.slice(0, 10))
    await visitor.page.locator('select[name=clubId]').selectOption(clubA.id)
    await visitor.page.locator('input[name=disponibles]').check()
    await visitor.page.locator('.event-card').filter({ hasText: event.titre }).waitFor()
    assert.equal(await visitor.page.locator('.event-card').count(), 1)
    await screen(visitor, 'combined-filters-live')
    await visitor.page.locator('input[name=q]:not([type=search])').fill(tag + '-no-result')
    await visitor.page.getByText('Aucun événement ne correspond.', { exact: true }).waitFor()
    await visitor.page.getByRole('button', { name: 'Réinitialiser', exact: true }).click()
    await visitor.page.locator('.event-card').filter({ hasText: event.titre }).waitFor()
    assert.ok(await visitor.page.locator('.event-card').count() > 1)
  }, ['US23-CANCEL'])

  await scenario('US20-RETURN', 'Visitor authentication returns to the original event and club', async () => {
    const returning = await actor('returning', bob.email)
    await visit(returning, '/events/' + event.id)
    await returning.page.getByRole('button', { name: 'S’inscrire', exact: true }).click()
    await returning.page.waitForURL('**/#/login')
    await login(returning)
    await returning.page.waitForURL('**/#/events/' + event.id)
    await screen(returning, 'authenticated-event-return')
    await call(returning, 'DELETE', '/auth/session', undefined, 204)
    await visit(returning, '/clubs/' + clubB.id)
    await returning.page.getByRole('button', { name: 'Rejoindre le club', exact: true }).click()
    await returning.page.waitForURL('**/#/login')
    await login(returning)
    await returning.page.waitForURL('**/#/clubs/' + clubB.id)
    await returning.page.getByRole('button', { name: 'En attente', exact: true }).waitFor()
    await screen(returning, 'authenticated-club-return')
  }, ['US23-CANCEL', 'US11-SCOPE'])

  await scenario('US09-CLUB', 'Club details show real contact, bureau and correct upcoming/past events', async () => {
    pastEvent = await call(manager, 'POST', '/events', {
      titre: tag + ' Past', description: 'Événement passé de recette', categorie: 'Acceptation',
      dateHeureDebut: new Date(Date.now() - 172800000).toISOString(),
      dateHeureFin: new Date(Date.now() - 169200000).toISOString(),
      lieu: 'Salle de recette', capaciteMax: 3, statut: 'PUBLIE', clubId: clubA.id,
    }, 201)
    await visit(visitor, '/clubs/' + clubA.id)
    await visitor.page.getByText('Bureau de recette', { exact: true }).waitFor()
    await visitor.page.locator('.club-contact').filter({ hasText: 'acceptance@usms.ma' }).waitFor()
    await visitor.page.locator('.event-card').filter({ hasText: event.titre }).waitFor()
    assert.equal(await visitor.page.locator('.event-card').filter({ hasText: pastEvent.titre }).count(), 0)
    await visitor.page.getByRole('button', { name: 'Passés', exact: true }).click()
    await visitor.page.locator('.event-card').filter({ hasText: pastEvent.titre }).waitFor()
    assert.equal(await visitor.page.locator('.event-card').filter({ hasText: event.titre }).count(), 0)
    await screen(visitor, 'club-past-events-contact')
  }, ['US23-CANCEL'])

  await scenario('US21-PAST', 'Past confirmed registration displays derived status and cancellation has no cutoff', async () => {
    // A historical registration is an isolated fixture, not a new registration into a past event.
    const id = sql(`INSERT INTO inscription(etudiant_id, evenement_id) VALUES (${sqlUUID(alice.user.id)}, ${sqlUUID(pastEvent.id)}) RETURNING id`)
    const stored = db('Historical confirmed fixture', `SELECT row_to_json(r) FROM inscription r WHERE r.id = ${sqlUUID(id)}`)
    assert.equal(stored.statut, 'CONFIRMEE')
    await visit(alice, '/planning')
    await alice.page.getByRole('button', { name: 'Passés', exact: true }).click()
    const card = alice.page.locator('.registration-card').filter({ hasText: pastEvent.titre })
    await card.getByText('Terminée', { exact: true }).waitFor()
    assert.equal(db('Past display preserves stored status', `SELECT row_to_json(r) FROM inscription r WHERE r.id = ${sqlUUID(id)}`).statut, 'CONFIRMEE')
    await screen(alice, 'past-planning-confirmed-status')
    await clickResponse(alice, 'DELETE', '/me/registrations/' + id, card.getByRole('button', { name: 'Annuler mon inscription', exact: true }), 204)
    await card.getByText('Annulée', { exact: true }).waitFor()
    assert.equal(db('Past cancellation permitted by D07', `SELECT row_to_json(r) FROM inscription r WHERE r.id = ${sqlUUID(id)}`).statut, 'ANNULEE')
    assert.equal((await call(visitor, 'GET', '/events/' + pastEvent.id)).placesRestantes, 3)
  }, ['US09-CLUB'])

  await scenario('BROWSER-ERRORS', 'No uncaught browser/React errors in the completed workflows', async () => {
    for (const who of actors) assert.deepEqual(who.errors, [], who.name)
  }, ['SETUP'])
})
