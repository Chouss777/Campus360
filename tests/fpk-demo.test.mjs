import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const base = process.env.CAMPUS360_URL || 'http://127.0.0.1:8080'
const project = process.env.CAMPUS360_TEST_PROJECT || 'campus360'
const out = process.env.CAMPUS360_EVIDENCE_DIR
const original = process.env.CAMPUS360_VERIFY_ORIGINAL
const password = process.env.CAMPUS360_TEST_PASSWORD
assert.ok(password, 'CAMPUS360_TEST_PASSWORD is required')
assert.ok(project === 'campus360' || project.startsWith('campus360-acceptance-'))
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname))
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright')
const resources = fileURLToPath(new URL('../backend/src/main/resources/demo/', import.meta.url))
const contexts = [], errors = [], writes = []
let browser, clubs, state, definitions, eventSnapshot
const hash = value => createHash('sha256').update(value).digest('hex')
const rows = text => text.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split('\t'))

function database() {
  // Password-free evidence only; no writes or credential dumps.
  const sql = `SELECT json_build_object(
    'accounts',(SELECT json_agg(a) FROM (SELECT id,email,nom,prenom,role,actif,est_verifie,date_creation FROM utilisateur ORDER BY email) a),
    'clubs',(SELECT json_agg(c) FROM club c),
    'events',(SELECT json_agg(e) FROM evenement e),
    'registrations',(SELECT COALESCE(json_agg(r),'[]'::json) FROM inscription r),
    'memberships',(SELECT COALESCE(json_agg(m),'[]'::json) FROM adhesion_club m),
    'invalidOwnership',(SELECT count(*) FROM evenement WHERE ((club_id IS NOT NULL)::int+(annonceur_id IS NOT NULL)::int)<>1),
    'unvalidatedConstraints',(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f' AND NOT convalidated)
  )`
  return JSON.parse(execFileSync('docker', ['exec','-i',project+'-database-1','psql','-U','campus360','-d','campus360','-At','-v','ON_ERROR_STOP=1','-c',sql], {encoding:'utf8'}))
}

before(async () => {
  definitions = rows(await readFile(join(resources,'fpk-clubs.tsv'),'utf8'))
  eventSnapshot = rows(await readFile(join(resources,'published-events.tsv'),'utf8'))
  state = database()
  browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE})
  if (out) { await mkdir(out,{recursive:true}); await writeFile(join(out,'database.json'),JSON.stringify(state,null,2)) }
  clubs = await (await fetch(base+'/api/v1/clubs')).json()
})
after(async () => {
  for (const context of contexts) await context.close()
  await browser?.close()
  assert.deepEqual(errors,[])
  assert.deepEqual(writes,[])
})

async function actor(email) {
  const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'})
  contexts.push(context)
  const p = await context.newPage()
  p.on('pageerror', e=>errors.push(e.message))
  await context.route('**/api/v1/**',route=>{
    const r=route.request()
    if(!['GET','HEAD','OPTIONS'].includes(r.method()) && new URL(r.url()).pathname!=='/api/v1/auth/session'){
      writes.push(r.method()+' '+r.url());return route.abort()
    }
    return route.continue()
  })
  if(email){
    await p.goto(base+'/#/login')
    await p.getByLabel('Adresse universitaire',{exact:true}).fill(email)
    await p.getByLabel('Mot de passe',{exact:true}).fill(password)
    await p.getByRole('button',{name:'Connexion',exact:true}).click()
    await p.locator('.account-menu').waitFor()
  }
  return p
}
async function screen(p,name){if(out)await p.screenshot({path:join(out,name+'.png'),fullPage:true})}

test('Seven exact club names/categories and original logos are served through the existing public media API',async()=>{
  assert.equal(clubs.length,7)
  assert.deepEqual(clubs.map(c=>c.nomClub).sort(),definitions.map(c=>c[2]).sort())
  for(const d of definitions){
    const club=clubs.find(c=>c.nomClub===d[2])
    assert.equal(club.categorie,d[3])
    assert.equal(club.description,d[4])
    assert.equal(club.statutActif,true)
    assert.match(club.logoUrl,/^\/api\/v1\/media\/[a-f0-9-]{36}\.(png|jpg)$/)
    const image=await fetch(base+club.logoUrl)
    assert.equal(image.status,200)
    assert.equal(hash(Buffer.from(await image.arrayBuffer())),hash(await readFile(join(resources,'clubs',d[5]))),'Original logo bytes must be preserved: '+d[2])
    const detail=await(await fetch(base+'/api/v1/clubs/'+club.id)).json()
    assert.equal(detail.nomClub,d[2]);assert.equal(detail.logoUrl,club.logoUrl)
    assert.equal(Object.hasOwn(detail,'responsables'),false)
  }
})

test('Published event IDs, content, dates, capacity and advertiser ownership match the retained snapshot',async()=>{
  const events=await(await fetch(base+'/api/v1/events')).json()
  assert.deepEqual(events.map(e=>e.id).sort(),eventSnapshot.map(e=>e[0]).sort())
  for(const e of events){
    const source=eventSnapshot.find(r=>r[0]===e.id)
    assert.equal(e.titre,source[1]);assert.equal(e.description,source[2]);assert.equal(e.categorie,source[3])
    assert.equal(new Date(e.dateHeureDebut).toISOString(),new Date(source[4]).toISOString())
    assert.equal(new Date(e.dateHeureFin).toISOString(),new Date(source[5]).toISOString())
    assert.equal(e.capaciteMax,Number(source[7]));assert.equal(e.statut,'PUBLIE')
    assert.equal(e.lieu,source[6])
    if(source[8]){
      const club=clubs.find(c=>c.nomClub===definitions.find(d=>d[0]===source[8])[2])
      assert.equal(e.clubId,club.id);assert.equal(e.organisateur,club.nomClub);assert.equal(e.annonceurId,null)
    }else{
      assert.equal(e.clubId,null)
      assert.equal(e.annonceurId,state.accounts.find(u=>u.email==='annonceur@usms.ma').id)
      assert.equal(e.organisateur,'Service universitaire')
    }
  }
  assert.equal(state.invalidOwnership,0);assert.equal(state.unvalidatedConstraints,0)
})

test('Only three demo identities are active; contextual managers and global permissions remain correct',async()=>{
  assert.deepEqual(state.accounts.filter(u=>u.actif).map(u=>u.email).sort(),['admin@usms.ma','annonceur@usms.ma','etudiant@usms.ma'])
  for(const [email,role]of[['admin@usms.ma','ADMINISTRATEUR'],['etudiant@usms.ma','ETUDIANT'],['annonceur@usms.ma','ANNONCEUR']]){
    const p=await actor(email)
    const me=await(await p.request.get(base+'/api/v1/me')).json()
    assert.equal(me.role,role);assert.equal(me.actif,true);assert.equal(me.estVerifie,true)
    assert.equal(Object.hasOwn(me,'motDePasseHash'),false)
    if(role==='ETUDIANT'){
      assert.equal(me.clubs.filter(c=>c.roleDansClub==='RESPONSABLE'&&c.statutActif).length,7)
      for(const club of clubs)assert.equal((await p.request.get(base+'/api/v1/clubs/'+club.id+'/memberships')).status(),200)
      await p.goto(base+'/#/manage');await p.locator('.event-counters').waitFor();await screen(p,'student-manager-dashboard')
    }else if(role==='ADMINISTRATEUR'){
      const adminClubs=await(await p.request.get(base+'/api/v1/admin/clubs')).json()
      for(const club of adminClubs.filter(c=>c.statutActif))assert.deepEqual(club.responsables.map(u=>u.email),['etudiant@usms.ma'])
      await p.goto(base+'/#/admin/clubs');await p.locator('.admin-club-card').first().waitFor();await screen(p,'admin-clubs')
    }else{
      assert.equal((await p.request.get(base+'/api/v1/clubs/'+clubs[0].id+'/memberships')).status(),403)
      await p.goto(base+'/#/manage');await p.locator('.event-counters').waitFor();await screen(p,'advertiser-dashboard')
    }
    if(role!=='ADMINISTRATEUR')assert.equal((await p.request.get(base+'/api/v1/admin/clubs')).status(),403)
  }
})

test('Every club card/detail renders original logos on desktop and mobile without overflow',async()=>{
  const p=await actor()
  for(const width of[1440,375]){
    await p.setViewportSize({width,height:900})
    await p.goto(base+'/#/clubs');await p.locator('.club-card').first().waitFor()
    await p.locator('.club-monogram img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())))
    assert.equal(await p.locator('.club-card').count(),7)
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await screen(p,'clubs-'+width)
    for(const club of clubs){
      await p.goto(base+'/#/clubs/'+club.id)
      const img=p.locator('.club-detail-header .club-monogram img');await img.waitFor();await img.evaluate(i=>i.decode())
      assert.equal(await p.locator('.club-detail-header h1').textContent(),club.nomClub)
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    }
    await screen(p,'club-detail-'+width)
  }
})

test('Rehearsal/upgrade retains all original rows and only applies the approved demo changes',{skip:!original},async()=>{
  const before=JSON.parse(await readFile(original,'utf8'))
  const sorted=items=>items.toSorted((a,b)=>a.id.localeCompare(b.id))
  const oldCopy=rows(await readFile(join(resources,'previous-published-events.tsv'),'utf8'))
  const expectedEvents=before.events.map(e=>{
    const old=oldCopy.find(r=>r[0]===e.id), next=eventSnapshot.find(r=>r[0]===e.id)
    return old && e.titre===old[1] && e.description===old[2] && e.lieu===old[6] && e.capacite_max===Number(old[7])
      ? {...e,titre:next[1],description:next[2],lieu:next[6],capacite_max:Number(next[7])} : e
  })
  assert.deepEqual(sorted(state.events),sorted(expectedEvents),'Only the approved fixture copy fields may change')
  assert.deepEqual(sorted(state.registrations),sorted(before.registrations),'Registration history must be unchanged')
  assert.equal(state.accounts.length,before.accounts.length)
  for(const prior of before.accounts){
    const retired=['responsable@usms.ma','responsable2@usms.ma','etudiant2@usms.ma'].includes(prior.email)
    assert.deepEqual(state.accounts.find(u=>u.id===prior.id),{...prior,actif:retired?false:prior.actif})
  }
  for(const prior of before.memberships){
    const migratedClub=['Club Informatique — Démo','Club Culture — Démo'].some(name=>before.clubs.find(c=>c.id===prior.club_id)?.nom_club===name)
    const retiredManager=before.accounts.some(u=>u.id===prior.etudiant_id&&['responsable@usms.ma','responsable2@usms.ma'].includes(u.email))
    assert.deepEqual(state.memberships.find(m=>m.id===prior.id),{...prior,role_dans_club:migratedClub&&retiredManager?'MEMBRE':prior.role_dans_club})
  }
  const legacy=before.clubs.some(c=>['Club Informatique — Démo','Club Culture — Démo'].includes(c.nom_club))
  assert.equal(state.clubs.length,before.clubs.length+(legacy?5:0))
  assert.equal(state.memberships.length,before.memberships.length+(legacy?7:0))
  for(const prior of before.clubs.filter(c=>!c.statut_actif))assert.deepEqual(state.clubs.find(c=>c.id===prior.id),prior)
})
