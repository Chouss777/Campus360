import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.CAMPUS360_URL || 'http://127.0.0.1:8080'
const out = process.env.CAMPUS360_EVIDENCE_DIR
const password = process.env.CAMPUS360_TEST_PASSWORD
assert.ok(password, 'CAMPUS360_TEST_PASSWORD is required')
const widths = [320, 375, 768, 1024, 1366, 1440, 1920]
const heights = [600, 768]
const measurements = [], errors = [], blockedWrites = []
let browser, eventId, clubId

before(async () => {
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) })
  if (out) await mkdir(out, { recursive: true })
  const context = await browser.newContext()
  const events = await (await context.request.get(base + '/api/v1/events')).json()
  const clubs = await (await context.request.get(base + '/api/v1/clubs')).json()
  eventId = (events.find(event => !event.passe) || events[0]).id
  clubId = clubs[0].id
  await context.close()
})

after(async () => {
  if (out) await writeFile(join(out, 'viewport-results.json'), JSON.stringify({ widths, heights, measurements, errors, blockedWrites }, null, 2))
  await browser?.close()
})

async function actor(t, email) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'fr-MA', reducedMotion: 'reduce' })
  await context.route('**/api/v1/**', route => {
    const request = route.request()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && new URL(request.url()).pathname !== '/api/v1/auth/session') {
      blockedWrites.push(request.method() + ' ' + request.url())
      return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  t.after(() => context.close())
  if (email) {
    await page.goto(base + '/#/login')
    await page.getByLabel('Adresse universitaire', { exact: true }).fill(email)
    await page.getByLabel('Mot de passe', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Connexion', exact: true }).click()
    await page.waitForFunction(() => !location.hash.startsWith('#/login'))
  }
  return page
}

async function screenshot(page, name) {
  if (out) await page.screenshot({ path: join(out, name + '.png'), fullPage: false })
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector)
      if (!node) return null
      const r = node.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }
    }
    const clipped = []
    for (const control of document.querySelectorAll('main a, main button, main input, main select, main textarea')) {
      if (control.closest('.sr-only, .skip-link, [inert]') || !control.checkVisibility()) continue
      const r = control.getBoundingClientRect()
      if (!r.width || !r.height) continue
      for (let parent = control.parentElement; parent && parent.tagName !== 'MAIN'; parent = parent.parentElement) {
        const s = getComputedStyle(parent), p = parent.getBoundingClientRect()
        if ((['clip', 'hidden'].includes(s.overflowY) && (r.top < p.top - 1 || r.bottom > p.bottom + 1)) ||
            (['clip', 'hidden'].includes(s.overflowX) && (r.left < p.left - 1 || r.right > p.right + 1))) {
          clipped.push({ tag: control.tagName, text: control.textContent.trim().slice(0, 70), parent: parent.className })
          break
        }
      }
    }
    return { viewport: { width: innerWidth, height: innerHeight }, clientWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth, shell: rect('.app-layout'), sidebar: rect('.sidebar'),
      main: rect('main'), auth: rect('.auth-layout'), clipped }
  })
}

function checkGeometry(result, label) {
  assert.ok(result.documentWidth <= result.clientWidth + 1, label + ': document horizontal overflow')
  assert.deepEqual(result.clipped, [], label + ': controls clipped by hidden/clip overflow')
  assert.ok(result.main.x >= -1 && result.main.x + result.main.width <= result.clientWidth + 1, label + ': main fits viewport')
}

async function checkSidebar(page, width, height, role, path) {
  const mobile = width <= 900
  const sidebar = page.locator('.sidebar')
  if (mobile) {
    assert.equal(await sidebar.getAttribute('inert'), '')
    const account = page.locator('.account-menu')
    if (await account.count()) {
      await account.locator('summary').click()
      assert.equal(await account.getAttribute('open'), '')
    }
    await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click()
    if (await account.count()) assert.equal(await account.getAttribute('open'), null, 'Account popup cannot overlap the mobile drawer')
    assert.equal(await sidebar.getAttribute('inert'), null)
    assert.equal(await page.locator('.workspace').getAttribute('inert'), '')
  }
  await sidebar.evaluate(node => { node.scrollTop = node.scrollHeight })
  const bottom = await sidebar.evaluate(node => {
    const s = node.getBoundingClientRect(), n = node.querySelector('.sidebar-note').getBoundingClientRect()
    const link = node.querySelector('.sidebar-note a').getBoundingClientRect()
    return { top: s.top, bottom: s.bottom, height: s.height, noteTop: n.top, noteBottom: n.bottom,
      linkTop: link.top, linkBottom: link.bottom, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight, hrefs: [...node.querySelectorAll('nav a')].map(a => a.getAttribute('href')) }
  })
  assert.ok(Math.abs(bottom.height - height) <= 1 && bottom.top >= -1 && bottom.bottom <= height + 1, 'Sidebar fits available height')
  assert.ok(bottom.noteTop >= 0 && bottom.noteBottom <= height + 1, 'Complete bottom card is reachable')
  assert.ok(bottom.linkTop >= 0 && bottom.linkBottom <= height + 1, 'Bottom link is reachable')
  assert.ok(bottom.hrefs.includes('#/home') && bottom.hrefs.includes('#/events') && bottom.hrefs.includes('#/clubs'))
  if (role === 'student') assert.ok(bottom.hrefs.includes('#/profile') && !bottom.hrefs.includes('#/admin/users'))
  if (role === 'manager' && path.startsWith('/manage')) assert.ok(bottom.hrefs.includes('#/manage/members'))
  if (role === 'advertiser') assert.ok(bottom.hrefs.includes('#/manage/events/new') && !bottom.hrefs.includes('#/manage/members'))
  if (role === 'admin' && path.startsWith('/admin')) assert.ok(bottom.hrefs.includes('#/admin/users') && bottom.hrefs.includes('#/admin/clubs'))
  if (role === 'student' && path === '/profile' && width === 1366 && height === 600)
    await screenshot(page, 'after-sidebar-bottom-1366x600')
  if (role === 'student' && path === '/profile' && width === 375 && height === 600)
    await screenshot(page, 'after-mobile-sidebar-375x600')
  if (mobile) {
    await page.keyboard.press('Escape')
    assert.equal(await sidebar.getAttribute('inert'), '')
    assert.equal(await page.locator('.workspace').getAttribute('inert'), null)
    assert.equal(await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).evaluate(el => el === document.activeElement), true)
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden')
  }
  await sidebar.evaluate(node => { node.scrollTop = 0 })
  return bottom
}

for (const [role, email, routes, primary] of [
  ['visitor', null, ['/home', '/events', '/event-detail', '/clubs', '/club-detail'], '/home'],
  ['student', 'etudiant@usms.ma', ['/profile', '/home', '/events', '/event-detail', '/clubs', '/club-detail', '/planning', '/registrations', '/memberships'], '/profile'],
  ['manager', 'etudiant@usms.ma', ['/manage', '/manage/events', '/manage/events/new', '/manage/members', '/home', '/profile', '/planning', '/registrations', '/memberships'], '/manage'],
  ['advertiser', 'annonceur@usms.ma', ['/manage', '/manage/events', '/manage/events/new', '/home', '/events', '/clubs'], '/manage'],
  ['admin', 'admin@usms.ma', ['/admin/users', '/admin/events', '/admin/clubs', '/home', '/events', '/clubs'], '/admin/users'],
]) {
  test(role + ': every required layout across requested widths and two short heights', async t => {
    const page = await actor(t, email)
    for (const width of widths) for (const height of heights) {
      await page.setViewportSize({ width, height })
      for (const route of routes) {
        const path = route === '/event-detail' ? '/events/' + eventId : route === '/club-detail' ? '/clubs/' + clubId : route
        await page.goto(base + '/#' + path)
        await page.locator('main h1').first().waitFor()
        await page.locator('.resource-loading').waitFor({ state: 'hidden' })
        await page.evaluate(() => { scrollTo(0, 0); document.querySelector('.sidebar').scrollTop = 0 })
        const result = await geometry(page)
        measurements.push({ role, path, ...result })
        checkGeometry(result, role + ' ' + path + ' ' + width + 'x' + height)
        assert.ok(Math.abs(result.shell.width - result.clientWidth) <= 1 && Math.abs(result.shell.x) <= 1, 'Shell uses viewport width')
        if (route === primary) {
          const name = { visitor: 'homepage', student: 'student', manager: 'organizer', advertiser: 'advertiser', admin: 'administrator' }[role]
          if ((width === 1366 && [600, 768].includes(height)) || (width === 1920 && height === 768)) {
            await page.evaluate(() => document.fonts.ready)
            await screenshot(page, 'after-' + name + '-' + width + 'x' + height)
          }
        }
        if (route === primary || (role === 'manager' && route === '/home'))
          result.sidebarReachability = await checkSidebar(page, width, height, role, path)
      }
    }
  })
}

test('Dedicated login, registration, OTP/resend and protected-route login fit every viewport', async t => {
  const page = await actor(t)
  for (const width of widths) for (const height of heights) {
    await page.setViewportSize({ width, height })
    for (const path of ['/login', '/register', '/verify', '/planning']) {
      await page.goto(base + '/#' + path)
      await page.locator('.auth-layout h1').waitFor()
      assert.equal(await page.locator('.app-layout, .sidebar, .topbar, .login-link').count(), 0, 'Authentication does not mount application shell')
      assert.equal(await page.getByRole('link', { name: 'Retour à l’accueil', exact: true }).count(), 1)
      assert.equal(await page.locator('.auth-brand img').count(), 1)
      assert.equal(await page.locator('.auth-brand').isVisible(), true)
      assert.equal(await page.locator('.auth-welcome-copy').isVisible(), width > 900)
      const result = await geometry(page)
      checkGeometry(result, path + ' ' + width + 'x' + height)
      measurements.push({ role: 'auth', path, ...result })
      for (const control of await page.locator('.auth-card input, .auth-card button').all()) {
        await control.scrollIntoViewIfNeeded()
        const box = await control.boundingBox()
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= height + 1, 'Auth control is visible or reachable by vertical scrolling')
        assert.equal(await control.evaluate(el => {
          const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)
          return hit === el || el.contains(hit)
        }), true, 'Auth control is not overlapped')
      }
      await page.evaluate(() => scrollTo(0, 0))
      if (path === '/login' && ((width === 1366 && [600,768].includes(height)) || (width === 1920 && height === 768)))
        await screenshot(page, 'after-login-' + width + 'x' + height)
      if ([320,375,768].includes(width) && height === 600 && path !== '/planning')
        await screenshot(page, 'after-auth-' + path.slice(1) + '-' + width + 'x' + height)
    }
  }
})

test('Wizard steps and inline administration forms fit every requested viewport', async t => {
  async function inspect(page, role, path, view, width, height) {
    const result = await geometry(page)
    checkGeometry(result, role + ' ' + view + ' ' + width + 'x' + height)
    measurements.push({ role, path, view, ...result })
    for (const control of await page.locator('.event-wizard input, .event-wizard select, .wizard-actions button, .admin-editor input, .admin-editor select, .admin-editor textarea, .admin-editor button').all()) {
      if (!await control.isVisible()) continue
      await control.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }))
      const box = await control.boundingBox()
      const reachable = box.x >= -1 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= height + 1
      if (!reachable) await screenshot(page, 'unreachable-' + view + '-' + width + 'x' + height)
      assert.ok(reachable, view + ': control can be reached ' + JSON.stringify({ width, height, box, control: await control.evaluate(el => ({ tag: el.tagName, name: el.name, text: el.textContent.slice(0, 50) })) }))
    }
  }
  for (const [role, email] of [['manager', 'etudiant@usms.ma'], ['advertiser', 'annonceur@usms.ma']]) {
    const page = await actor(t, email)
    for (const width of widths) for (const height of heights) {
      await page.setViewportSize({ width, height })
      await page.goto(base + '/#/manage/events/new')
      await page.locator('input[name=titre]').fill('Vérification de mise en page sans enregistrement')
      await page.locator('input[name=categorie]').fill('Test')
      await page.locator('textarea[name=description]').fill('Saisie temporaire pour contrôler les dimensions du formulaire.')
      await page.getByRole('button', { name: 'Suivant', exact: true }).click()
      await inspect(page, role, '/manage/events/new', 'details', width, height)
      await page.locator('input[name=lieu]').fill('Campus')
      await page.locator('input[name=dateHeureDebut]').fill('2030-01-01T10:00')
      await page.locator('input[name=dateHeureFin]').fill('2030-01-01T12:00')
      await page.getByRole('button', { name: 'Suivant', exact: true }).click()
      await inspect(page, role, '/manage/events/new', 'publication', width, height)
      // Leave the final submit untouched: these checks must not create events.
      await page.goto(base + '/#/manage')
    }
  }
  const page = await actor(t, 'admin@usms.ma')
  for (const width of widths) for (const height of heights) {
    await page.setViewportSize({ width, height })
    await page.goto(base + '/#/admin/users')
    await page.getByRole('button', { name: 'Gérer', exact: true }).first().click()
    await inspect(page, 'admin', '/admin/users', 'account-editor', width, height)
    await page.goto(base + '/#/admin/clubs')
    await page.getByRole('button', { name: 'Créer un club', exact: true }).click()
    await inspect(page, 'admin', '/admin/clubs', 'club-create', width, height)
    await page.locator('.admin-editor').getByRole('button', { name: 'Fermer', exact: true }).click()
    await page.getByRole('button', { name: 'Modifier / nommer un responsable', exact: true }).first().click()
    await inspect(page, 'admin', '/admin/clubs', 'club-editor', width, height)
    await page.locator('.admin-editor').getByRole('button', { name: 'Fermer', exact: true }).click()
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(blockedWrites, [])
})

test('Read-only layout checks cause no business writes or uncaught browser errors', () => {
  assert.deepEqual(errors, [])
  assert.deepEqual(blockedWrites, [])
})
