import json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=Path(__file__).resolve().parents[3]
HTML='<h1>旧稿保持原样</h1><p>封面兼容位置。</p><hr class="page-break"><h2>内页顶部标题</h2><p>这是一份隔离合成稿，用于比较旧版与候选版的文字几何。</p>'
READ='''async()=>{const db=await new Promise(r=>{const q=indexedDB.open('xhs-poster-documents');q.onsuccess=()=>r(q.result)});const result=await new Promise(r=>{const q=db.transaction('documents').objectStore('documents').getAll();q.onsuccess=()=>r(q.result)});db.close();return result}'''
WRITE='''async doc=>{const db=await new Promise(r=>{const q=indexedDB.open('xhs-poster-documents');q.onsuccess=()=>r(q.result)});await new Promise((r,j)=>{const t=db.transaction(['documents','meta'],'readwrite');t.objectStore('documents').clear();t.objectStore('documents').put(doc);t.objectStore('meta').put({key:'active-document-id',value:doc.id});t.oncomplete=r;t.onerror=()=>j(t.error)});db.close()}'''
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',headless=True,args=['--no-proxy-server']);out=[]
 def ready(pg):
  pg.wait_for_selector('.ProseMirror[contenteditable=true]');pg.wait_for_function('document.querySelectorAll(".page").length===2&&[...document.querySelectorAll(".page")].every(p=>["ready","ready-with-warnings"].includes(p.dataset.layoutState))');pg.wait_for_timeout(200)
 def same(a,b):
  return all(x[0]==y[0] and all(abs(v-w)<.05 for v,w in zip(x[1:],y[1:])) for ap,bp in zip(a,b) for x,y in zip(ap,bp))
 def geom(pg):return pg.locator('.page').evaluate_all('ps=>ps.map(p=>{const r=p.getBoundingClientRect(),s=r.width/1080;return [...p.querySelectorAll(".content > *")].map(e=>{const a=e.getBoundingClientRect();return [e.textContent,(a.x-r.x)/s,(a.y-r.y)/s,a.width/s,a.height/s]})})')
 for rule,label in [('every','每页都显示'),('none','不显示')]:
  c=b.new_context(viewport={'width':1600,'height':1100});pg=c.new_page();pg.goto('http://127.0.0.1:4199/');pg.wait_for_selector('.ProseMirror[contenteditable=true]');pg.wait_for_timeout(500)
  ed=pg.locator('.ProseMirror');ed.click();pg.keyboard.press('Meta+a');ed.evaluate('(e,h)=>{const d=new DataTransfer();d.setData("text/html",h);e.dispatchEvent(new ClipboardEvent("paste",{clipboardData:d,bubbles:true,cancelable:true}))}',HTML);ready(pg)
  pg.locator('.inspector-field').filter(has=pg.get_by_text('Logo 策略',exact=True)).get_by_role('combobox').click();pg.get_by_role('option',name=label,exact=True).click();ready(pg)
  pg.get_by_label('设置当前页').select_option('1');pg.get_by_role('group',name='仅当前内页 · 垂直位置').get_by_role('button',name='顶部',exact=True).click();ready(pg)
  old=geom(pg);pg.wait_for_timeout(1800);docs=pg.evaluate(READ);doc=docs[0];assert doc['style']['logoStrategy']==rule
  cc=b.new_context(viewport={'width':1600,'height':1100});new=cc.new_page();new.goto('http://127.0.0.1:4197/');new.wait_for_selector('.ProseMirror[contenteditable=true]');new.wait_for_timeout(1000);new.evaluate(WRITE,doc);new.reload();ready(new)
  now=geom(new);assert same(old,now),(rule,old,now)
  new.get_by_label('设置当前页').select_option('1');new.get_by_role('combobox',name='本页 Logo 显示',exact=True).click();new.get_by_role('option',name='隐藏' if rule=='every' else '显示',exact=True).click();ready(new);assert same(geom(new),now)
  assert new.locator('.page').first.get_attribute('data-cover-logo-position')=='visible-area'
  out.append({'legacyStrategy':rule,'geometryEqual':True,'visibilityToggleNoReflow':True,'old':old,'candidate':now});c.close();cc.close()
 (BASE/'evidence/legacy-compat.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print('PASS legacy v1.13.0 visible/hidden top drafts: exact text geometry, default cover position, no reflow');b.close()
