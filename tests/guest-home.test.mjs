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
const measurements = []
let browser
before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE })
  if (out) await mkdir(out, { recursive: true })
})
after(async () => {
  if (out) await writeFile(join(out, 'results.json'), JSON.stringify({ measurements }, null, 2))
  await browser?.close()
})

async function actor(t) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage(), errors = [], writes = []
  await context.route('**/api/v1/**', route => {
    const request = route.request()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && new URL(request.url()).pathname !== '/api/v1/auth/session') {
      writes.push(request.method() + ' ' + request.url())
      return route.abort()
    }
    return route.continue()
  })
  page.on('pageerror', error => errors.push(error.message))
  t.after(async () => {
    await context.close()
    assert.deepEqual(errors, [], 'No browser errors')
    assert.deepEqual(writes, [], 'No business records changed')
  })
  return page
}
async function home(page) {
  await page.goto(base + '/#/home', { waitUntil: 'domcontentloaded' })
  await page.locator('.event-card').first().waitFor()
  await page.locator('.home-clubs .club-card').first().waitFor()
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map(i => i.decode()))
  })
}
async function login(page) {
  await page.getByLabel('Adresse universitaire', { exact: true }).fill('etudiant@usms.ma')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Connexion', exact: true }).click()
  await page.locator('.account-menu').waitFor()
}
async function screen(page, name) {
  if (out) await page.screenshot({ path: join(out, name + '.png'), fullPage: true })
}
async function geometry(page, role, route) {
  const result = await page.evaluate(() => {
    const header = document.querySelector('.topbar').getBoundingClientRect()
    return {
      width: innerWidth, height: innerHeight,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      actions: [...document.querySelectorAll('.guest-actions a, .account-menu summary, .global-search input')].map(el => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return { name: el.textContent.trim() || el.getAttribute('aria-label'),
          fits: r.x >= 0 && r.right <= innerWidth && r.y >= header.y && r.bottom <= header.bottom,
          visible: hit === el || el.contains(hit), width: r.width, height: r.height }
      }),
      brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length,
    }
  })
  measurements.push({ role, route, ...result })
  assert.equal(result.overflow, false, JSON.stringify(result))
  assert.equal(result.brokenImages, 0)
  assert.ok(result.actions.every(a => a.fits && a.visible), JSON.stringify(result))
}

test('Guest homepage uses real events and active clubs; header/actions fit desktop, tablet and mobile', async t => {
  const p = await actor(t)
  await home(p)
  assert.equal((await p.locator('.greeting strong').textContent()).trim(), 'Bienvenue sur Campus360 👋')
  assert.equal(await p.locator('.greeting > span').textContent(), "Découvrez la vie étudiante à l'USMS.")
  const clubs = await (await p.request.get(base + '/api/v1/clubs')).json()
  assert.deepEqual(await p.locator('.home-clubs .club-card-title').allTextContents(), clubs.slice(0, 4).map(c => c.nomClub))
  assert.ok(clubs.every(c => c.statutActif))
  assert.equal(await p.locator('.event-card .event-details-hint').count(), await p.locator('.event-card').count())
  for (const card of await p.locator('.event-card, .home-clubs .club-card').all()) {
    assert.equal(await card.locator('a').count(), 1, 'One keyboard-accessible destination per card')
  }
  const hero = await p.locator('.campus-hero').evaluate(el => ({
    gradient: getComputedStyle(el, '::after').backgroundImage,
    crop: getComputedStyle(el.querySelector('img')).objectPosition,
    image: el.querySelector('img').naturalWidth,
  }))
  assert.equal(hero.crop, '50% 60%')
  assert.equal(hero.image, 3051)
  assert.ok(hero.gradient.includes('81, 48, 185'))
  for (const [width, height] of [[320,600],[375,768],[768,768],[1024,600],[1366,768],[1440,900],[1920,1080]]) {
    await p.setViewportSize({ width, height })
    await geometry(p, 'guest', '/home')
    if (width === 375 || width === 1440) await screen(p, 'guest-home-' + width)
  }
  await p.setViewportSize({width:375,height:768})
  const eventLink = p.locator('.event-card .discovery-link').first()
  const eventHref = await eventLink.getAttribute('href')
  await eventLink.focus()
  await p.keyboard.press('Enter')
  await p.waitForURL(base + '/' + eventHref)
  await p.getByRole('tab', {name:'Description',exact:true}).waitFor()
  await geometry(p, 'guest', 'event-detail')
  await p.getByRole('button', {name:'S’inscrire',exact:true}).click()
  await p.waitForURL('**/#/login')
  assert.equal(await p.evaluate(() => sessionStorage.getItem('campus360:returnTo')), eventHref.slice(1))
  await home(p)
  const clubLink = p.locator('.home-clubs .discovery-link').first()
  const clubHref = await clubLink.getAttribute('href')
  await clubLink.focus()
  await p.keyboard.press('Enter')
  await p.waitForURL(base + '/' + clubHref)
  await p.getByRole('button', {name:'Rejoindre le club',exact:true}).waitFor()
  await geometry(p, 'guest', 'club-detail')
  await p.getByRole('button', {name:'Rejoindre le club',exact:true}).click()
  await p.waitForURL('**/#/login')
  assert.equal(await p.evaluate(() => sessionStorage.getItem('campus360:returnTo')), clubHref.slice(1))
})

test('Actual signed-in student keeps personalized greeting, navigation and logout state', async t => {
  const p = await actor(t)
  await p.goto(base + '/#/login')
  await login(p)
  await home(p)
  const me = await (await p.request.get(base + '/api/v1/me')).json()
  assert.equal((await p.locator('.greeting strong').textContent()).trim(), `Bonjour, ${me.prenom} 👋`)
  assert.equal(await p.locator('.guest-actions').count(), 0)
  for (const width of [1440,375]) {
    await p.setViewportSize({width,height:width === 375 ? 768 : 900})
    await geometry(p, 'student', '/home')
    await screen(p, 'student-home-' + width)
  }
  await p.getByRole('button', {name:'Ouvrir le menu',exact:true}).click()
  await p.getByRole('link', {name:'Mon planning',exact:true}).waitFor()
  await p.getByRole('link', {name:'Mes adhésions',exact:true}).waitFor()
  await p.locator('.sidebar').getByRole('button', {name:'Fermer le menu',exact:true}).click()
  await p.locator('.account-menu summary').click()
  await p.getByRole('button', {name:'Se déconnecter',exact:true}).click()
  await p.locator('.guest-actions').waitFor()
  assert.equal((await p.locator('.greeting strong').textContent()).trim(), 'Bienvenue sur Campus360 👋')
})

test('Header login and registration routes preserve the original event/club destination', async t => {
  for (const type of ['events','clubs']) {
    for (const action of ['login','register']) {
      await t.test(type + ' → ' + action + ' → login → original detail', async t => {
        const p = await actor(t)
        const records = await (await p.request.get(base + '/api/v1/' + type)).json()
        const record = records.find(r => !r.passe) || records[0]
        const path = '/' + type + '/' + record.id
        await p.goto(base + '/#' + path)
        await p.locator('.guest-actions').waitFor()
        await p.locator('.guest-actions .' + (action === 'login' ? 'login-link' : 'register-link')).click()
        await p.waitForURL('**/#/' + action)
        assert.equal(await p.evaluate(() => sessionStorage.getItem('campus360:returnTo')), path)
        if (action === 'register') {
          await p.getByRole('heading', {name:'Créer mon compte',exact:true}).waitFor()
          await p.getByRole('link', {name:'J’ai déjà un compte',exact:true}).click()
        }
        await login(p)
        await p.waitForURL(base + '/#' + path)
        assert.equal(await p.evaluate(() => sessionStorage.getItem('campus360:returnTo')), null)
      })
    }
  }
})

test('Club preview is limited, handles empty/failure/retry independently of live events', async t => {
  const p = await actor(t)
  const clubs = await (await p.request.get(base + '/api/v1/clubs')).json()
  const fixture = Array.from({length:6}, (_,i) => ({...clubs[0],id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,nomClub:'Club de test ' + i}))
  await p.route('**/api/v1/clubs', route => route.fulfill({json:fixture}))
  await home(p)
  assert.equal(await p.locator('.home-clubs .club-card').count(), 4)
  await p.unroute('**/api/v1/clubs')
  await p.route('**/api/v1/clubs', route => route.fulfill({json:[]}))
  await p.reload()
  await p.getByText('Aucun club actif pour le moment.', {exact:true}).waitFor()
  await p.locator('.event-card').first().waitFor()
  await p.unroute('**/api/v1/clubs')
  let release
  const held = new Promise(resolve => {release=resolve})
  await p.route('**/api/v1/clubs', async route => {
    await held
    await route.fulfill({status:503,json:{detail:'Indisponibilité de test'}})
  })
  await p.reload({waitUntil:'domcontentloaded'})
  await p.locator('.home-clubs [role=status]').waitFor()
  await p.locator('.event-card').first().waitFor()
  release()
  await p.locator('.home-clubs [role=alert]').waitFor()
  assert.equal(await p.locator('.home-clubs .club-card').count(), 0)
  await p.unroute('**/api/v1/clubs')
  await p.locator('.home-clubs').getByRole('button', {name:'Réessayer',exact:true}).click()
  await p.locator('.home-clubs .club-card').first().waitFor()
  assert.equal(await p.locator('.home-clubs .club-card').count(), Math.min(clubs.length,4))
})
