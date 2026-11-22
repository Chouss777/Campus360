import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const base = process.env.CAMPUS360_URL || 'http://127.0.0.1:8080'
const project = process.env.CAMPUS360_TEST_PROJECT || 'campus360'
const baseline = process.env.CAMPUS360_COPY_BASELINE
const out = process.env.CAMPUS360_EVIDENCE_DIR
const password = process.env.CAMPUS360_TEST_PASSWORD
assert.ok(password, 'CAMPUS360_TEST_PASSWORD is required')
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname))
assert.ok(project === 'campus360' || project.startsWith('campus360-acceptance-'))
assert.ok(baseline && out, 'Supply the pre-cleanup inventory and an evidence directory')
const resources = fileURLToPath(new URL('../backend/src/main/resources/demo/',import.meta.url))
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright')
const contexts = [], errors = [], writes = [], measurements = []
let browser, beforeState, state, definitions, events, clubs
const rows = text => text.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t'))
const sorted = items => items.toSorted((a,b)=>a.id.localeCompare(b.id))
const placeholder = /démonstration|salle démo|— démo/iu

before(async()=>{
  beforeState = JSON.parse(await readFile(baseline,'utf8'))
  definitions = rows(await readFile(join(resources,'fpk-clubs.tsv'),'utf8'))
  const sql = `SELECT json_build_object(
    'clubs',(SELECT json_agg(c) FROM club c),
    'events',(SELECT json_agg(e) FROM evenement e),
    'registrations',(SELECT json_agg(i) FROM inscription i),
    'memberships',(SELECT json_agg(m) FROM adhesion_club m),
    'advertisers',(SELECT json_agg(a) FROM annonceur a),
    'accounts',(SELECT json_agg(u) FROM (SELECT id,email,nom,prenom,role,actif,est_verifie,date_creation FROM utilisateur)u),
    'confirmed',(SELECT json_agg(x) FROM (SELECT evenement_id,count(*) AS total FROM inscription WHERE statut='CONFIRMEE' GROUP BY evenement_id)x))`
  state = JSON.parse(execFileSync('docker',['exec',project+'-database-1','psql','-U','campus360','-d','campus360','-At','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8'}))
  await mkdir(out,{recursive:true})
  await writeFile(join(out,'database.json'),JSON.stringify(state,null,2))
  events = await (await fetch(base+'/api/v1/events')).json()
  clubs = await (await fetch(base+'/api/v1/clubs')).json()
  browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE})
})
after(async()=>{
  for(const context of contexts)await context.close()
  await browser?.close()
  await writeFile(join(out,'browser-evidence.json'),JSON.stringify({measurements,errors,writes},null,2))
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
})
async function actor(email){
  const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'})
  contexts.push(context)
  await context.route('**/api/v1/**',route=>{
    const request=route.request()
    if(!['GET','HEAD','OPTIONS'].includes(request.method())&&new URL(request.url()).pathname!=='/api/v1/auth/session'){
      writes.push(request.method()+' '+request.url());return route.abort()
    }
    return route.continue()
  })
  const p=await context.newPage()
  p.on('pageerror',e=>errors.push(e.message))
  if(email){
    await p.goto(base+'/#/login')
    await p.getByLabel('Adresse universitaire',{exact:true}).fill(email)
    await p.getByLabel('Mot de passe',{exact:true}).fill(password)
    await p.getByRole('button',{name:'Connexion',exact:true}).click()
    await p.locator('.account-menu').waitFor()
  }
  return p
}
async function capture(p,name){
  await p.evaluate(()=>document.fonts.ready)
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  assert.equal(overflow,false,name+' horizontal overflow')
  measurements.push({name,width:p.viewportSize().width,overflow})
  await p.screenshot({path:join(out,name+'.png'),fullPage:true})
}

test('Only seven club text fields, four approved event copies and the known advertiser label change',async()=>{
  const expected=rows(await readFile(join(resources,'published-events.tsv'),'utf8'))
  assert.deepEqual(sorted(state.events),sorted(beforeState.events.map(e=>{
    const next=expected.find(r=>r[0]===e.id)
    return next?{...e,titre:next[1],description:next[2],lieu:next[6],capacite_max:Number(next[7])}:e
  })))
  assert.deepEqual(sorted(state.clubs),sorted(beforeState.clubs.map(c=>{
    const next=definitions.find(d=>c.nom_club===d[9])
    return next?{...c,nom_club:next[2],description:next[4]}:c
  })))
  for(const key of ['registrations','memberships','accounts'])assert.deepEqual(sorted(state[key]),sorted(beforeState[key]),key+' changed')
  const advertiserId=state.accounts.find(u=>u.email==='annonceur@usms.ma').id
  const byOwner=items=>items.toSorted((a,b)=>a.utilisateur_id.localeCompare(b.utilisateur_id))
  assert.deepEqual(byOwner(state.advertisers),byOwner(beforeState.advertisers.map(a=>a.utilisateur_id===advertiserId?{...a,nom_organisation:'Service universitaire'}:a)))
})

test('Public API exposes clean copy and correct capacity minus confirmed registrations',async()=>{
  assert.equal(events.length,4);assert.equal(clubs.length,7)
  const evidence=[]
  for(const e of events){
    assert.equal(placeholder.test([e.titre,e.description,e.lieu,e.organisateur].join(' ')),false)
    const confirmed=Number(state.confirmed.find(r=>r.evenement_id===e.id)?.total||0)
    assert.ok(e.capaciteMax>=confirmed)
    assert.equal(e.placesRestantes,e.capaciteMax-confirmed)
    evidence.push({id:e.id,title:e.titre,category:e.categorie,description:e.description,location:e.lieu,capacity:e.capaciteMax,confirmed,remaining:e.placesRestantes,organizer:e.organisateur,status:e.statut})
  }
  for(const d of definitions){
    const c=clubs.find(c=>c.nomClub===d[2]);assert.ok(c);assert.equal(c.description,d[4])
  }
  await writeFile(join(out,'published-events.json'),JSON.stringify(evidence,null,2))
})

test('Guest homepage, catalogue, all event details and seven club descriptions show updated API data',async()=>{
  const p=await actor()
  for(const width of [1440,375]){
    await p.setViewportSize({width,height:900})
    for(const route of ['/home','/events']){
      await p.goto(base+'/#'+route)
      await p.locator('.event-card').first().waitFor()
      for(const e of events){
        const card=p.locator('.event-card').filter({has:p.getByRole('link',{name:e.titre,exact:true})})
        if(route==='/home'&&e.passe)continue
        await card.waitFor();assert.ok((await card.innerText()).includes(e.lieu))
        assert.ok((await card.innerText()).includes(e.placesRestantes+' places'))
        assert.equal(placeholder.test(await card.innerText()),false)
      }
      await capture(p,route.slice(1)+'-'+width)
    }
    for(const e of events){
      await p.goto(base+'/#/events/'+e.id)
      await p.getByRole('heading',{name:e.titre,exact:true}).waitFor()
      assert.ok((await p.locator('.event-meta').innerText()).includes(e.lieu))
      assert.equal(placeholder.test(await p.locator('main').innerText()),false)
      await p.getByRole('tab',{name:'Informations',exact:true}).click()
      assert.ok((await p.locator('main').innerText()).includes(e.placesRestantes+' / '+e.capaciteMax))
      await capture(p,'event-'+e.categorie+'-'+(e.passe?'past-':'')+width)
    }
  }
  for(const d of definitions){
    const club=clubs.find(c=>c.nomClub===d[2])
    await p.goto(base+'/#/clubs/'+club.id)
    await p.getByRole('heading',{name:club.nomClub,exact:true}).waitFor()
    assert.ok((await p.locator('main').innerText()).includes(d[4]))
  }
  await p.setViewportSize({width:1440,height:900});await p.goto(base+'/#/clubs')
  await p.locator('.club-card').first().waitFor();await capture(p,'clubs-1440')
})

test('Planning and manager/advertiser interfaces retain permissions and use the cleaned records',async()=>{
  const student=await actor('etudiant@usms.ma')
  const registrations=await(await student.request.get(base+'/api/v1/me/registrations')).json()
  await student.goto(base+'/#/planning')
  await student.getByRole('button',{name:'Toutes',exact:true}).click()
  for(const registration of registrations){
    const e=events.find(e=>e.id===registration.evenementId)
    if(!e)continue
    const card=student.locator('.registration-card').filter({has:student.getByRole('link',{name:e.titre,exact:true})})
    await card.waitFor();assert.ok((await card.innerText()).includes(e.lieu));assert.equal(placeholder.test(await card.innerText()),false)
  }
  await capture(student,'planning-1440')
  for(const [p,owned,name]of [[student,events.filter(e=>e.clubId),'club-manager'],[await actor('annonceur@usms.ma'),events.filter(e=>e.annonceurId),'advertiser']]){
    await p.goto(base+'/#/manage/events')
    await p.locator('.management-toolbar select').selectOption('PUBLIE')
    for(const e of owned){
      const row=p.locator('tbody tr').filter({has:p.getByText(e.titre,{exact:true})})
      await row.waitFor();const text=await row.innerText()
      assert.ok(text.includes(e.lieu));assert.ok(text.includes(e.placesRestantes+' / '+e.capaciteMax));assert.equal(placeholder.test(text),false)
    }
    await capture(p,name+'-1440')
    const e=owned.find(e=>!e.passe)||owned[0]
    await p.locator('tbody tr').filter({has:p.getByText(e.titre,{exact:true})}).getByRole('button',{name:'Modifier',exact:true}).click()
    await p.locator('input[name="titre"]').waitFor()
    assert.equal(await p.locator('input[name="titre"]').inputValue(),e.titre)
    await p.getByRole('button',{name:/Suivant/}).click()
    assert.equal(await p.getByLabel('Lieu',{exact:true}).inputValue(),e.lieu)
    assert.equal(Number(await p.locator('input[name="capaciteMax"]').inputValue()),e.capaciteMax)
    await capture(p,name+'-edit-1440')
  }
})
