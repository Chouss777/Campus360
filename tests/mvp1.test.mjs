import test from 'node:test'
import assert from 'node:assert/strict'

const base = process.env.CAMPUS360_URL || 'http://127.0.0.1:8081'
const mailbox = process.env.MAILPIT_URL || 'http://127.0.0.1:8025'
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
const password = process.env.CAMPUS360_TEST_PASSWORD
assert.ok(password, 'CAMPUS360_TEST_PASSWORD is required')
assert.equal(process.env.CAMPUS360_ISOLATED_ACCEPTANCE, '1', 'Mutation tests require a disposable isolated stack')
assert.ok(['18080','18081'].includes(new URL(base).port), 'Do not run fixture writes on the main demo')
assert.equal(new URL(mailbox).port, '18025', 'Keep test email in isolated Mailpit')

class Client {
  cookies = new Map()

  async request(method, path, body, csrf = true) {
    const headers = { Accept: 'application/json' }
    if (method !== 'GET' && csrf) {
      const token = await this.request('GET', '/auth/csrf')
      headers['X-XSRF-TOKEN'] = token.data.token
    }
    headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const response = await fetch(`${base}/api/v1${path}`, {
      method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    })
    for (const cookie of response.headers.getSetCookie()) {
      const entry = cookie.split(';')[0]
      const equals = entry.indexOf('=')
      this.cookies.set(entry.slice(0, equals), entry.slice(equals + 1))
    }
    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: response.status, data }
  }

  async expect(method, path, status, body, csrf = true) {
    const result = await this.request(method, path, body, csrf)
    assert.equal(result.status, status, `${method} ${path}: ${JSON.stringify(result.data)}`)
    return result.data
  }

  async login(email) {
    return this.expect('POST', '/auth/session', 200, { email, motDePasse: password })
  }
}

async function emailFor(recipient, subject) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`${mailbox}/api/v1/messages?limit=100`)
    const listing = await response.json()
    const match = listing.messages.find((message) => message.Subject.includes(subject) && message.To.some((address) => address.Address === recipient))
    if (match) return (await fetch(`${mailbox}/api/v1/message/${match.ID}`)).json()
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`No ${subject} email delivered to ${recipient}`)
}

test('MVP 1 acceptance against the demo application and PostgreSQL', async (t) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${base}/api/v1/health`)).ok) break
    } catch { /* The backend may still be starting. */ }
    if (attempt === 59) throw new Error('Backend did not become healthy within 60 seconds')
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  const visitor = new Client()
  const admin = new Client()
  const manager = new Client()
  const otherManager = new Client()
  const advertiser = new Client()
  const student = new Client()
  const second = new Client()
  let studentUser
  let secondUser
  let club
  let event
  let registration

  t.after(async () => {
    if (event) await admin.expect('POST', `/admin/events/${event.id}/withdraw`, 204)
    if (studentUser) await admin.expect('PATCH', `/admin/users/${studentUser.id}`, 204, { actif: false })
    if (secondUser) await admin.expect('PATCH', `/admin/users/${secondUser.id}`, 204, { actif: false })
    if (club) await admin.expect('PUT', `/admin/clubs/${club.id}`, 200, { ...club, statutActif: false, responsableId: null })
  })

  const adminUser = await admin.login('admin@usms.ma')
  assert.equal(adminUser.role, 'ADMINISTRATEUR')
  const managerUser = await manager.login('etudiant@usms.ma')
  const managerEmail = `recette-manager-${suffix}@usms.ma`
  await otherManager.expect('POST', '/auth/register', 201, {nom:'Recette',prenom:'Manager',email:managerEmail,motDePasse:password})
  const managerOtp = await emailFor(managerEmail, 'Vérifiez')
  await otherManager.expect('POST', '/auth/verify', 204, {email:managerEmail,code:managerOtp.Text.match(/\b[0-9]{6}\b/)[0]})
  await otherManager.login(managerEmail)
  await advertiser.login('annonceur@usms.ma')

  await t.test('US01–US03 · university email, duplicate, OTP delivery, verification and session', async () => {
    const email = `recette-${suffix}@usms.ma`
    const signup = { nom: 'Recette', prenom: 'MVP', email, motDePasse: password, cneApogee: 'TEST-CNE' }
    await visitor.expect('POST', '/auth/register', 422, { ...signup, email: 'recette@gmail.com' })
    await student.expect('POST', '/auth/register', 201, signup)
    await student.expect('POST', '/auth/register', 409, signup)
    await student.expect('POST', '/auth/session', 403, { email, motDePasse: password })
    const message = await emailFor(email, 'Vérifiez')
    const code = message.Text.match(/\b[0-9]{6}\b/)[0]
    await student.expect('POST', '/auth/verify', 204, { email, code })
    studentUser = await student.login(email)
    assert.equal(studentUser.estVerifie, true)
    assert.equal(studentUser.actif, true)
    assert.equal(studentUser.profile.cneApogee, 'TEST-CNE')

    const secondEmail = `recette-b-${suffix}@usms.ma`
    await second.expect('POST', '/auth/register', 201, { ...signup, email: secondEmail })
    const secondMessage = await emailFor(secondEmail, 'Vérifiez')
    await second.expect('POST', '/auth/verify', 204, { email: secondEmail, code: secondMessage.Text.match(/\b[0-9]{6}\b/)[0] })
    secondUser = await second.login(secondEmail)
  })

  await t.test('US04–US07 · profile, immutable email/CNE, RBAC and CSRF', async () => {
    await student.expect('GET', '/admin/users', 403)
    await student.expect('PATCH', '/me/profile', 403, { filiere: 'Test', niveau: 'L3', centresInteret: [] }, false)
    const profile = await student.expect('PATCH', '/me/profile', 200, {
      filiere: 'Informatique', niveau: 'L3', centresInteret: ['Web', 'Clubs'], email: 'changed@usms.ma', cneApogee: 'CHANGED',
    })
    assert.equal(profile.email, studentUser.email)
    assert.equal(profile.profile.cneApogee, 'TEST-CNE')
    assert.deepEqual(profile.profile.centresInteret, ['Web', 'Clubs'])
    assert.equal((await student.expect('GET', '/me', 200)).profile.niveau, 'L3')
  })

  await t.test('US08–US12 · clubs, membership decisions, ownership and admin-only editing', async () => {
    const input = { nomClub: `Club recette ${suffix}`, description: 'Club de recette MVP 1', categorie: 'Recette', logoUrl: '', statutActif: true, responsableId: managerUser.id, contact: 'club@usms.ma', bureau: 'Bureau de recette' }
    club = await admin.expect('POST', '/admin/clubs', 201, input)
    await admin.expect('POST', '/admin/clubs', 409, input)
    assert.equal((await visitor.expect('GET', `/clubs/${club.id}`, 200)).contact, input.contact)
    await manager.expect('PUT', `/admin/clubs/${club.id}`, 403, input)
    await otherManager.expect('GET', `/clubs/${club.id}/memberships`, 403)
    const before = (await visitor.expect('GET', `/clubs/${club.id}`, 200)).nombreMembres
    const membership = await student.expect('POST', `/clubs/${club.id}/memberships`, 201)
    await student.expect('POST', `/clubs/${club.id}/memberships`, 409)
    await manager.expect('PATCH', `/clubs/${club.id}/memberships/${membership.id}`, 204, { statut: 'ACCEPTE' })
    assert.equal((await visitor.expect('GET', `/clubs/${club.id}`, 200)).nombreMembres, before + 1)
    await manager.expect('DELETE', `/clubs/${club.id}/memberships/${membership.id}`, 204)
    assert.equal((await visitor.expect('GET', `/clubs/${club.id}`, 200)).nombreMembres, before)
    const rejected = await second.expect('POST', `/clubs/${club.id}/memberships`, 201)
    await manager.expect('PATCH', `/clubs/${club.id}/memberships/${rejected.id}`, 204, { statut: 'REFUSE' })
  })

  await t.test('US05 · validated image upload and persistent profile URL', async () => {
    const invalid = new FormData()
    invalid.append('image', new Blob(['not an image'], { type: 'image/png' }), 'invalid.png')
    await student.expect('POST', '/media', 422, invalid)
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64')
    const form = new FormData()
    // Exercise multipart bodies larger than Nginx's default upload limit.
    const uploadedBytes = Buffer.concat([bytes, Buffer.alloc(1100000)])
    form.append('image', new Blob([uploadedBytes], { type: 'image/png' }), 'profile.png')
    const uploaded = await student.expect('POST', '/media', 201, form)
    const profile = await student.expect('PATCH', '/me/profile', 200, { filiere: 'Informatique', niveau: 'L3', centresInteret: ['Web'], photoProfil: uploaded.url })
    assert.equal(profile.profile.photoProfil, uploaded.url)
    await visitor.expect('GET', uploaded.url.replace('/api/v1', ''), 401)
    await second.expect('GET', uploaded.url.replace('/api/v1', ''), 403)
    const cookie = [...student.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    const image = await fetch(`${base}${uploaded.url}`, { headers: { Cookie: cookie } })
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), uploadedBytes)
    await second.expect('PATCH', '/me/profile', 403, { filiere: '', niveau: '', centresInteret: [], photoProfil: uploaded.url })
    const logo = new FormData()
    logo.append('image', new Blob([bytes], { type: 'image/png' }), 'club.png')
    const publicLogo = await admin.expect('POST', '/media', 201, logo)
    await admin.expect('PUT', `/admin/clubs/${club.id}`, 200, { ...club, logoUrl: publicLogo.url, responsableId: null })
    assert.equal((await fetch(`${base}${publicLogo.url}`)).status, 200)
  })

  const eventInput = {
    titre: `Recette événement ${suffix}`, description: 'Description test concurrence', categorie: 'Recette',
    dateHeureDebut: new Date(Date.now() + 86400000).toISOString(), dateHeureFin: new Date(Date.now() + 90000000).toISOString(),
    lieu: 'Salle de recette', capaciteMax: 1, statut: 'BROUILLON',
  }

  await t.test('US13–US18 · draft visibility, publication, organizer ownership and filters', async () => {
    event = await manager.expect('POST', '/events', 201, { ...eventInput, clubId: club.id })
    await visitor.expect('GET', `/events/${event.id}`, 404)
    await otherManager.expect('PUT', `/events/${event.id}`, 403, { ...eventInput, clubId: club.id })
    await manager.expect('POST', '/events', 422, { ...eventInput, capaciteMax: 0, clubId: club.id })
    event = await manager.expect('PUT', `/events/${event.id}`, 200, { ...eventInput, clubId: club.id, statut: 'PUBLIE' })
    assert.equal(event.clubId, club.id)
    const filtered = await visitor.expect('GET', `/events?q=${encodeURIComponent(suffix)}&categorie=Recette&clubId=${club.id}&disponibles=true`, 200)
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].id, event.id)
    const date = event.dateHeureDebutCampus.slice(0, 10)
    assert.equal((await visitor.expect('GET', `/events?date=${date}&clubId=${club.id}`, 200))[0].id, event.id)
    assert.deepEqual(await visitor.expect('GET', '/events?q=nonexistent-recette-value', 200), [])
    const advertised = await advertiser.expect('POST', '/events', 201, { ...eventInput, titre: `Annonceur recette ${suffix}`, statut: 'PUBLIE' })
    assert.equal(advertised.clubId, null)
    assert.ok(advertised.annonceurId)
    await manager.expect('PUT', `/events/${advertised.id}`, 403, { ...eventInput, clubId: club.id })
    await admin.expect('POST', `/admin/events/${advertised.id}/withdraw`, 204)
    await visitor.expect('GET', `/events/${advertised.id}`, 404)
  })

  await t.test('D01 · administrator suspension, restoration, validation and preserved registrations', async () => {
    const existing = await student.expect('POST', `/events/${event.id}/registrations`, 201)
    await manager.expect('POST', `/admin/events/${event.id}/suspend`, 403)
    await advertiser.expect('POST', `/admin/events/${event.id}/restore`, 403)
    await student.expect('POST', `/admin/events/${event.id}/validate`, 403)
    await admin.expect('POST', `/admin/events/${event.id}/suspend`, 204)
    await visitor.expect('GET', `/events/${event.id}`, 404)
    assert.equal((await visitor.expect('GET', '/events', 200)).some((item) => item.id === event.id), false)
    await second.expect('POST', `/events/${event.id}/registrations`, 409)
    const preserved = (await student.expect('GET', '/me/registrations', 200)).find((item) => item.id === existing.id)
    assert.equal(preserved.statut, 'CONFIRMEE')
    assert.equal(preserved.dateInscription, existing.dateInscription)
    await manager.expect('PUT', `/events/${event.id}`, 403, { ...eventInput, clubId: club.id, statut: 'PUBLIE' })
    await manager.expect('PUT', `/events/${event.id}`, 200, { ...eventInput, clubId: club.id, statut: 'SUSPENDU' })
    await admin.expect('POST', `/admin/events/${event.id}/restore`, 204)
    const restored = await visitor.expect('GET', `/events/${event.id}`, 200)
    assert.equal(restored.statut, 'PUBLIE')
    assert.equal(restored.disponibilite, 'COMPLET')
    await student.expect('DELETE', `/me/registrations/${existing.id}`, 204)
    const draft = await manager.expect('POST', '/events', 201, { ...eventInput, titre: `Validation D01 ${suffix}`, clubId: club.id })
    await admin.expect('POST', `/admin/events/${draft.id}/validate`, 204)
    assert.equal((await visitor.expect('GET', `/events/${draft.id}`, 200)).statut, 'PUBLIE')
    await admin.expect('POST', `/admin/events/${draft.id}/withdraw`, 204)
  })

  await t.test('US17, US19, US21–US23 · concurrent last place, duplicates, email, cancellation and capacity', async () => {
    const results = await Promise.all([student.request('POST', `/events/${event.id}/registrations`), second.request('POST', `/events/${event.id}/registrations`)])
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409])
    const winner = results[0].status === 201 ? student : second
    const winnerUser = results[0].status === 201 ? studentUser : secondUser
    registration = results.find((result) => result.status === 201).data
    assert.equal(registration.statut, 'CONFIRMEE')
    assert.equal((await visitor.expect('GET', `/events/${event.id}`, 200)).disponibilite, 'COMPLET')
    assert.ok((await visitor.expect('GET', '/events', 200)).some((row) => row.id === event.id))
    assert.equal((await visitor.expect('GET', `/events?clubId=${club.id}&disponibles=true`, 200)).length, 0)
    await winner.expect('POST', `/events/${event.id}/registrations`, 409)
    await emailFor(winnerUser.email, 'Confirmation')
    assert.ok((await winner.expect('GET', '/me/registrations', 200)).some((row) => row.id === registration.id))
    await winner.expect('DELETE', `/me/registrations/${registration.id}`, 204)
    assert.equal((await visitor.expect('GET', `/events/${event.id}`, 200)).placesRestantes, 1)
    await student.expect('POST', `/events/${event.id}/registrations`, 201)
    const enlarged = { ...eventInput, clubId: club.id, capaciteMax: 2, statut: 'PUBLIE' }
    await manager.expect('PUT', `/events/${event.id}`, 200, enlarged)
    await second.expect('POST', `/events/${event.id}/registrations`, 201)
    await manager.expect('PUT', `/events/${event.id}`, 409, { ...enlarged, capaciteMax: 1 })
    const archived = { nomClub: club.nomClub, description: club.description, categorie: club.categorie, logoUrl: '', statutActif: false }
    await admin.expect('PUT', `/admin/clubs/${club.id}`, 200, archived)
    assert.equal((await visitor.expect('GET', '/clubs', 200)).some((row) => row.id === club.id), false)
    assert.equal((await visitor.expect('GET', `/events/${event.id}`, 200)).clubActif, false)
  })

  await t.test('US07 · suspension revokes existing sessions permanently; logout ends session', async () => {
    await admin.expect('PATCH', `/admin/users/${studentUser.id}`, 204, { actif: false })
    await student.expect('GET', '/me', 401)
    await student.expect('POST', '/auth/session', 403, { email: studentUser.email, motDePasse: password })
    await admin.expect('PATCH', `/admin/users/${studentUser.id}`, 204, { actif: true })
    await student.expect('GET', '/me', 401)
    await student.login(studentUser.email)
    await student.expect('DELETE', '/auth/session', 204)
    await student.expect('GET', '/me', 401)
  })

  await t.test('US04, US22 · role assignment updates permissions and past planning preserves status', async () => {
    await admin.expect('PATCH', `/admin/users/${secondUser.id}`, 204, { role: 'ANNONCEUR', nomOrganisation: `Partenaire ${suffix}`, typePartenaire: 'Partenaire', contactTel: '0600000000' })
    await second.expect('GET', '/me', 401)
    assert.equal((await second.login(secondUser.email)).role, 'ANNONCEUR')
    await second.expect('GET', '/me/registrations', 403)
    const created = await second.expect('POST', '/events', 201, { ...eventInput, titre: `Partenaire ${suffix}`, statut: 'PUBLIE' })
    assert.equal(created.annonceurId, secondUser.id)
    assert.equal(created.contactTel, '0600000000')
    await admin.expect('POST', `/admin/events/${created.id}/withdraw`, 204)
    await admin.expect('PATCH', `/admin/users/${secondUser.id}`, 204, { role: 'ETUDIANT' })
    assert.equal((await second.login(secondUser.email)).profile.cneApogee, 'TEST-CNE')
    const demoStudent = new Client()
    await demoStudent.login('etudiant@usms.ma')
    const planning = await demoStudent.expect('GET', '/me/registrations', 200)
    assert.ok(planning.some((item) => item.evenement.passe))
    assert.ok(planning.every((item) => ['CONFIRMEE', 'ANNULEE'].includes(item.statut)))
  })
})
