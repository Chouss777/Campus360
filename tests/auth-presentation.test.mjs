import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.CAMPUS360_URL || 'http://127.0.0.1:8080'
let browser
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE }) })
after(async () => { await browser?.close() })
async function pageFor(t, motion='reduce') {
  const context = await browser.newContext({viewport:{width:1366,height:768}, reducedMotion:motion})
  const page = await context.newPage()
  const errors=[]
  page.on('pageerror', e=>errors.push(e.message))
  t.after(async()=>{assert.deepEqual(errors,[]);await context.close()})
  await page.goto(base+'/#/login')
  await page.locator('.auth-card h1').waitFor()
  return page
}
test('Password visibility is keyboard accessible and never submits or loses input',async t=>{
  const p=await pageFor(t)
  let submissions=0
  p.on('request',r=>{if(r.method()==='POST')submissions++})
  for(const route of ['/login','/register']) {
    await p.evaluate(route=>{location.hash='#'+route},route)
    const input=p.getByLabel('Mot de passe',{exact:true})
    await input.fill('Temporary password')
    const show=p.getByRole('button',{name:'Afficher le mot de passe',exact:true})
    await show.focus()
    await p.keyboard.press('Space')
    assert.equal(await input.getAttribute('type'),'text')
    assert.equal(await input.inputValue(),'Temporary password')
    const hide=p.getByRole('button',{name:'Masquer le mot de passe',exact:true})
    assert.equal(await hide.getAttribute('aria-pressed'),'true')
    assert.equal(await hide.evaluate(el=>el===document.activeElement),true)
    await p.keyboard.press('Enter')
    assert.equal(await input.getAttribute('type'),'password')
    assert.equal(await input.inputValue(),'Temporary password')
  }
  assert.equal(submissions,0)
})
test('Auth view transitions preserve in-memory drafts, reset password visibility and avoid storage',async t=>{
  const p=await pageFor(t)
  const logo=await p.locator('.auth-brand').elementHandle()
  await p.getByLabel('Adresse universitaire',{exact:true}).fill('draft@usms.ma')
  await p.getByLabel('Mot de passe',{exact:true}).fill('In-memory only')
  await p.getByRole('button',{name:'Afficher le mot de passe',exact:true}).click()
  await p.getByRole('link',{name:'Créer un compte universitaire',exact:true}).click()
  await p.getByLabel('Prénom',{exact:true}).fill('Draft')
  await p.getByLabel('Nom',{exact:true}).fill('Campus')
  await p.getByRole('link',{name:'J’ai déjà un compte',exact:true}).click()
  assert.equal(await p.getByLabel('Adresse universitaire',{exact:true}).inputValue(),'draft@usms.ma')
  assert.equal(await p.getByLabel('Mot de passe',{exact:true}).inputValue(),'In-memory only')
  assert.equal(await p.getByLabel('Mot de passe',{exact:true}).getAttribute('type'),'password')
  assert.equal(await logo.evaluate(el=>el===document.querySelector('.auth-brand')),true)
  await p.getByRole('link',{name:'Créer un compte universitaire',exact:true}).click()
  assert.equal(await p.getByLabel('Prénom',{exact:true}).inputValue(),'Draft')
  assert.equal(await p.getByLabel('Nom',{exact:true}).inputValue(),'Campus')
  assert.equal(await p.evaluate(()=>JSON.stringify([Object.entries(sessionStorage),Object.entries(localStorage)]).includes('In-memory only')),false)
  await p.reload()
  assert.equal(await p.getByLabel('Prénom',{exact:true}).inputValue(),'')
})
test('White surfaces and reduced motion apply consistently to login, registration and OTP',async t=>{
  const p=await pageFor(t)
  for(const route of ['/login','/register','/verify']) {
    await p.evaluate(route=>{location.hash='#'+route},route)
    await p.locator('.auth-card h1').waitFor()
    assert.equal(await p.locator('.sidebar,.topbar,.app-layout').count(),0)
    assert.equal(await p.locator('.auth-layout').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)')
    assert.equal(await p.locator('.auth-brand').isVisible(),true)
    const animations=await p.locator('.auth-layout').evaluate(el=>[el,...el.querySelectorAll('*')].filter(n=>getComputedStyle(n).animationName!=='none').map(n=>n.className))
    assert.deepEqual(animations,[])
  }
})
test('Validation errors preserve fields and do not replay the entrance animation',async t=>{
  const p=await pageFor(t,'no-preference')
  const card=await p.locator('.auth-card').elementHandle()
  await p.waitForTimeout(1000)
  const animationStart=await card.evaluate(el=>el.getAnimations().map(a=>a.startTime))
  const floating=await p.locator('.auth-brand').evaluate(el=>({duration:getComputedStyle(el).animationDuration,iteration:getComputedStyle(el).animationIterationCount}))
  assert.ok(floating.duration.includes('6s')&&floating.iteration.includes('infinite'))
  await p.route('**/api/v1/auth/session',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Identifiants incorrects — test visuel.'})}))
  await p.getByLabel('Adresse universitaire',{exact:true}).fill('error@usms.ma')
  await p.getByLabel('Mot de passe',{exact:true}).fill('Preserved password')
  await p.getByRole('button',{name:'Connexion',exact:true}).click()
  await p.getByRole('alert').waitFor()
  assert.equal(await card.evaluate(el=>el===document.querySelector('.auth-card')),true)
  assert.deepEqual(await card.evaluate(el=>el.getAnimations().map(a=>a.startTime)),animationStart)
  assert.equal(await p.getByLabel('Mot de passe',{exact:true}).inputValue(),'Preserved password')
})
test('Desktop login fits the viewport and auth transitions keep column geometry stable',async t=>{
  const p=await pageFor(t)
  for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]) {
    await p.setViewportSize({width,height})
    const positions=[]
    for(const view of ['login','register','verify','login']) {
      await p.evaluate(view=>{location.hash='#/'+view},view)
      await p.getByRole('heading',{name:{login:'Bienvenue sur Campus360',register:'Créer mon compte',verify:'Vérifier mon adresse'}[view],exact:true}).waitFor()
      await p.evaluate(()=>document.fonts.ready)
      const metrics=await p.evaluate(()=>{
        const card=document.querySelector('.auth-card').getBoundingClientRect()
        return {height:innerHeight,scrollHeight:document.documentElement.scrollHeight,
          width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
          cardX:card.x,cardWidth:card.width,logoWidth:document.querySelector('.auth-brand').getBoundingClientRect().width}
      })
      assert.ok(metrics.scrollWidth<=metrics.width,'No right-edge overflow')
      if(view==='login') assert.ok(metrics.scrollHeight<=height,'Login fits '+width+'x'+height)
      assert.equal(metrics.cardWidth,528)
      assert.equal(metrics.logoWidth,308)
      positions.push([metrics.cardX,metrics.cardWidth])
    }
    assert.ok(positions.every(position=>JSON.stringify(position)===JSON.stringify(positions[0])),
      'Scrollbar changes must not shift the columns horizontally')
  }
})
test('Live decorative animation stays within the document at desktop breakpoints',async t=>{
  const p=await pageFor(t,'no-preference')
  for(const [width,height] of [[901,600],[1024,600],[1366,768],[1440,900],[1920,1080]]) {
    await p.setViewportSize({width,height})
    await p.waitForTimeout(800)
    for(const time of [0,6000,12000,18000,24000,30000,36000,42000]) {
      await p.locator('.auth-orbits').evaluate((el,time)=>{
        for(const animation of el.getAnimations()) {animation.pause();animation.currentTime=time}
      },time)
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,
        'Orbits must not add horizontal overflow at '+width+'x'+height)
      if(height>=768) assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true,
        'Decorations must not add vertical overflow to desktop login')
    }
  }
})
