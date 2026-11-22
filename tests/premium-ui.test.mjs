import test, {before,after} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright')
const base=process.env.CAMPUS360_URL||'http://127.0.0.1:8080'
const password=process.env.CAMPUS360_TEST_PASSWORD
assert.ok(password,'CAMPUS360_TEST_PASSWORD is required')
let browser
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE})})
after(async()=>{await browser?.close()})
async function actor(t,email,motion='reduce'){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:motion})
 const page=await context.newPage(),errors=[],writes=[]
 await page.addInitScript(()=>{
  window.campusEntrances=[]
  const animate=Element.prototype.animate
  Element.prototype.animate=function(frames,options){window.campusEntrances.push({id:this.id,className:this.className,frames,options});return animate.call(this,frames,options)}
 })
 await context.route('**/api/v1/**',route=>{
  const r=route.request()
  if(!['GET','HEAD','OPTIONS'].includes(r.method())&&new URL(r.url()).pathname!=='/api/v1/auth/session'){
   writes.push(r.method()+' '+r.url());return route.abort()
  }
  return route.continue()
 })
 page.on('pageerror',e=>errors.push(e.message))
 t.after(async()=>{assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await context.close()})
 if(email){await page.goto(base+'/#/login');await page.getByLabel('Adresse universitaire',{exact:true}).fill(email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Connexion',exact:true}).click();await page.locator('.account-menu').waitFor()}
 return page
}
test('Public hero, search, category filtering and empty/reset remain connected to real API data',async t=>{
 const p=await actor(t)
 await p.goto(base+'/#/home',{waitUntil:'domcontentloaded'})
 await p.locator('.event-card').first().waitFor()
 assert.equal(await p.locator('.campus-hero .artwork').count(),1)
 assert.equal(await p.locator('.campus-hero').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(15, 54, 107)')
 const category=p.locator('.category-tabs button').nth(1)
 const text=(await category.textContent()).trim()
 await category.click()
 assert.equal(await category.getAttribute('aria-pressed'),'true')
 assert.ok((await p.locator('.event-art .badge').allTextContents()).every(c=>c===text))
 await p.getByRole('link',{name:'Voir tous les événements',exact:true}).click()
 await p.getByRole('heading',{name:'Événements du campus',exact:true}).waitFor()
 await p.locator('.filters input[name=q]').fill('no-such-campus-event-visual-test')
 await p.locator('.resource-loading').waitFor({state:'hidden'})
 await p.locator('.empty').waitFor()
 assert.equal(await p.locator('.event-card').count(),0)
 await p.getByRole('button',{name:'Réinitialiser',exact:true}).click()
 await p.locator('.event-card').first().waitFor()
 assert.equal(await p.locator('.filters input[name=q]').inputValue(),'')
})
test('Event tabs preserve keyboard navigation and display the real capacity',async t=>{
 const p=await actor(t,'etudiant@usms.ma')
 const events=await(await p.request.get(base+'/api/v1/events')).json(),event=events.find(e=>!e.passe)||events[0]
 await p.goto(base+'/#/events/'+event.id)
 await p.getByRole('tab',{name:'Description',exact:true}).waitFor()
 await p.getByRole('tab',{name:'Description',exact:true}).focus()
 await p.keyboard.press('ArrowRight')
 assert.equal(await p.getByRole('tab',{name:'Informations',exact:true}).getAttribute('aria-selected'),'true')
 assert.ok((await p.getByRole('tabpanel').textContent()).includes(String(event.placesRestantes)))
 await p.keyboard.press('Home')
 assert.equal(await p.getByRole('tab',{name:'Description',exact:true}).getAttribute('aria-selected'),'true')
})
for(const email of ['etudiant@usms.ma','annonceur@usms.ma']){
 test('Wizard transitions retain every entered value for '+email,async t=>{
  const p=await actor(t,email,'no-preference')
  await p.goto(base+'/#/manage/events/new')
  await p.locator('input[name=titre]').fill('Draft remains local')
  await p.locator('input[name=categorie]').fill('Technologie')
  await p.locator('textarea[name=description]').fill('No business data is saved by this visual regression test.')
  await p.getByRole('button',{name:'Suivant',exact:true}).click()
  await p.locator('input[name=lieu]').fill('Campus')
  await p.locator('input[name=dateHeureDebut]').fill('2030-01-01T10:00')
  await p.locator('input[name=dateHeureFin]').fill('2030-01-01T12:00')
  await p.locator('input[name=capaciteMax]').fill('42')
  await p.getByRole('button',{name:'Précédent',exact:true}).click()
  assert.equal(await p.locator('input[name=titre]').inputValue(),'Draft remains local')
  assert.equal(await p.locator('textarea[name=description]').inputValue(),'No business data is saved by this visual regression test.')
  await p.getByRole('button',{name:'Suivant',exact:true}).click()
  assert.equal(await p.locator('input[name=capaciteMax]').inputValue(),'42')
  await p.getByRole('button',{name:'Suivant',exact:true}).click()
  await p.locator('.publication-summary').waitFor()
  assert.ok((await p.locator('.publication-summary').textContent()).includes('Draft remains local'))
  const entrances=await p.evaluate(()=>window.campusEntrances)
  assert.ok(entrances.some(a=>a.id==='main-content'))
  assert.ok(entrances.filter(a=>String(a.className).includes('wizard-card')).length>=4)
  if(email.startsWith('annonceur'))assert.equal(await p.locator('select[name=clubId]').count(),0)
 })
}
test('Reduced-motion keeps pages, cards, dropdown and wizard still without remounting forms',async t=>{
 const p=await actor(t,'etudiant@usms.ma')
 for(const path of ['/home','/manage','/manage/events/new']){
  await p.goto(base+'/#'+path)
  await p.locator('main h1').first().waitFor()
  await p.locator('.resource-loading').waitFor({state:'hidden'})
  const animated=await p.locator('.app-layout').evaluate(el=>[el,...el.querySelectorAll('*')].filter(n=>getComputedStyle(n).animationName!=='none').map(n=>n.className))
  assert.deepEqual(animated,[])
  assert.deepEqual(await p.evaluate(()=>window.campusEntrances),[])
 }
 await p.locator('input[name=titre]').fill('Kept during account menu use')
 await p.locator('.account-menu summary').click()
 await p.keyboard.press('Escape')
 assert.equal(await p.locator('input[name=titre]').inputValue(),'Kept during account menu use')
 assert.equal(await p.locator('.account-menu').getAttribute('open'),null)
})
test('Loading and failed primary data show honest feedback, then Retry restores live cards',async t=>{
 const p=await actor(t)
 let release
 const held=new Promise(r=>{release=r})
 await p.route('**/api/v1/events',async route=>{await held;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary visual-test failure'})})})
 await p.goto(base+'/#/home')
 await p.locator('section[aria-labelledby="upcoming-title"] .resource-loading').waitFor()
 assert.equal(await p.locator('.event-card').count(),0)
 release()
 await p.getByRole('alert').waitFor()
 assert.equal(await p.locator('.event-card').count(),0)
 await p.unroute('**/api/v1/events')
 await p.getByRole('button',{name:'Réessayer',exact:true}).click()
 await p.locator('.event-card').first().waitFor()
})
