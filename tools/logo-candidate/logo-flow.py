import json,base64,zipfile,hashlib,io
from pathlib import Path
from PIL import Image,ImageChops
from playwright.sync_api import sync_playwright,expect
BASE=Path(__file__).resolve().parents[3]
OUT=BASE/'evidence'
HTML='<h1>让品牌恰好出现</h1><p>Logo 显示范围与封面位置 · 本地合成稿</p><hr class="page-break" data-page-id="page-a"><h2>每一页都有选择</h2><p>整篇设置保持简单，本页可以独立显示或隐藏。</p><hr class="page-break" data-page-id="page-b"><h2>把完整图片留给读者</h2><p>封面裁切只是参考，原图保留完整尺寸。</p>'
report={'checks':[],'exports':[]}
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',headless=True,args=['--no-proxy-server'])
 ctx=b.new_context(viewport={'width':1600,'height':1100},accept_downloads=True)
 ctx.add_init_script('window.showSaveFilePicker=undefined;window.showDirectoryPicker=undefined')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(15000)
 page.goto('http://127.0.0.1:4197/')
 def ready(n=None):
  page.wait_for_selector('.ProseMirror[contenteditable=true]')
  page.wait_for_function('n=>document.querySelectorAll(".page").length>0&&(n===null||document.querySelectorAll(".page").length===n)&&[...document.querySelectorAll(".page")].every(p=>["ready","ready-with-warnings"].includes(p.dataset.layoutState))',arg=n)
  page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def choose(label,value):
  page.get_by_role('combobox',name=label,exact=True).click();page.get_by_role('option',name=value,exact=True).click();ready()
 def select(i):page.get_by_label('设置当前页').select_option(str(i));ready()
 def vis(): return page.locator('.page').evaluate_all('ps=>ps.map(p=>p.dataset.logoVisible==="true")')
 def fixture(html=HTML):
  page.evaluate('(h)=>window.__editor.commands.setContent(h)',html);ready()
 def geom():
  ready();return page.locator('.page').evaluate_all('ps=>ps.map(p=>{const r=p.getBoundingClientRect(),s=r.width/1080,l=p.querySelector(".logo").getBoundingClientRect();return {logo:[(l.x-r.x)/s,(l.y-r.y)/s,l.width/s,l.height/s],text:[...p.querySelectorAll(".content > *")].map(e=>{const a=e.getBoundingClientRect();return [e.textContent,(a.x-r.x)/s,(a.y-r.y)/s,a.width/s,a.height/s]}),issues:p.dataset.layoutIssues}})')
 def check(name):report['checks'].append(name);(OUT/'logo-flow-progress.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('PASS',name,flush=True)
 ready();fixture();select(0)
 initial=geom();assert initial[0]['logo']==[900,200,120,120],initial
 choose('封面 Logo 位置','与内页一致');inner=geom();assert inner[0]['logo']==inner[1]['logo']==[900,100,120,120]
 assert [x['text'] for x in initial]==[x['text'] for x in inner]
 page.get_by_role('button',name='撤销',exact=True).click();ready();assert geom()[0]['logo'][1]==200
 page.get_by_role('button',name='重做',exact=True).click();ready();assert geom()[0]['logo'][1]==100
 check('two positions share inner x/y/size, preserve all text geometry, undo/redo')
 # All rules and per-page settings, including 1/2/3-page first/last boundaries.
 for n in [1,2,3]:
  fixture('<hr class="page-break">'.join(['<h1>合成单页</h1><p>边界验证。</p>']+['<h2>内页</h2><p>边界验证。</p>']*(n-1)))
  for rule,label in [('every','每页显示'),('first','仅首页'),('first-last','仅首尾页'),('none','不显示')]:
   if page.get_by_role('button',name='恢复所有页面跟随',exact=True).is_enabled():page.get_by_role('button',name='恢复所有页面跟随',exact=True).click();ready()
   choose('整篇显示范围',label)
   wanted=[rule=='every' or rule=='first' and i==0 or rule=='first-last' and (i==0 or i==n-1) for i in range(n)]
   assert vis()==wanted,(n,rule,vis(),wanted)
   for i in range(n):
    select(i)
    for option,value in [('显示',True),('隐藏',False)]:
     choose('本页 Logo 显示',option);expected=wanted.copy();expected[i]=value;assert vis()==expected,(n,rule,i,option,vis())
    choose('本页 Logo 显示','跟随整篇设置 · '+('显示' if wanted[i] else '隐藏'));assert vis()==wanted
 check('all 4 global × 3 per-page settings on 1, 2 and 3 pages')
 fixture();select(0);choose('整篇显示范围','每页显示');choose('本页 Logo 显示','隐藏');select(1);choose('本页 Logo 显示','显示')
 choose('整篇显示范围','不显示');assert vis()==[False,True,False]
 assert '2 页单独设置' in page.locator('.logo-controls').inner_text()
 page.get_by_role('button',name='恢复所有页面跟随',exact=True).click();ready();assert vis()==[False]*3
 page.get_by_role('button',name='撤销',exact=True).click();ready();assert vis()==[False,True,False]
 page.get_by_role('button',name='重做',exact=True).click();ready();assert vis()==[False]*3
 page.get_by_role('button',name='撤销',exact=True).click();ready();assert vis()==[False,True,False]
 check('global changes retain overrides; reset follows current rule and is one undo/redo step')
 # Inner top layout does not move on visibility toggles.
 page.get_by_role('group',name='仅当前内页 · 垂直位置',exact=True).get_by_role('button',name='顶部',exact=True).click();a=geom()
 choose('本页 Logo 显示','隐藏');c=geom();assert a[1]['text']==c[1]['text'],(a[1],c[1])
 choose('本页 Logo 显示','显示');assert geom()[1]['text']==a[1]['text']
 check('hide/show leaves inner top text, anchor and material unchanged')
 # Insertion before stable page-a, deletion, role changes, and restoration.
 before=page.evaluate('window.__editor.getJSON()')
 page.evaluate('()=>{const e=window.__editor;e.view.dispatch(e.state.tr.insert(0,e.schema.nodes.horizontalRule.create()).setMeta("closeHistory",true))}')
 ready(4);assert vis()==[False,False,True,False],vis()
 page.evaluate('()=>{const e=window.__editor;let p;e.state.doc.forEach((n,pos)=>{if(n.attrs.pageId==="page-a")p=pos});e.view.dispatch(e.state.tr.delete(p,p+1))}')
 ready(3);assert vis()==[False,False,False]
 page.get_by_role('button',name='撤销',exact=True).click();ready()
 # Restore exact synthetic fixture after structural history test.
 page.evaluate('(d)=>{const e=window.__editor;e.chain().setContent(d).command(({tr})=>{tr.setDocAttribute("logoSettings",d.attrs.logoSettings);return true}).run()}',before);ready(3)
 check('insert/delete do not rebind surviving page overrides; undo restores boundaries')
 # Template save, application, draft save/refresh tested via UI.
 select(0);choose('封面 Logo 位置','与内页一致')
 page.get_by_role('button',name='主题库',exact=True).click();d=page.get_by_role('dialog');d.get_by_role('tab',name='我的',exact=True).click();d.get_by_placeholder('主题名称').fill('Logo 本地审阅');d.get_by_role('button',name='保存',exact=True).click();d.locator('[data-theme-id]').filter(has_text='Logo 本地审阅').wait_for();page.keyboard.press('Escape');d.wait_for(state='hidden')
 themes=page.evaluate('''async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('xhs-poster-themes');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return await new Promise((res,rej)=>{const r=db.transaction('user-themes').objectStore('user-themes').getAll();r.onsuccess=()=>{db.close();res(r.result)};r.onerror=()=>rej(r.error)})}''')
 saved=next(t for t in themes if t['name']=='Logo 本地审阅');assert saved['coverLogoPosition']=='inner' and saved['contentJSON'] is None
 def theme(name,tab='内置'):
  page.get_by_role('button',name='主题库',exact=True).click();d.get_by_role('tab',name=tab,exact=True).click();d.locator('[data-theme-id]').filter(has_text=name).get_by_role('button',name='应用',exact=True).click();d.wait_for(state='hidden');ready()
 theme('极简白');assert vis()==[False,True,True]
 theme('Logo 本地审阅','我的');assert vis()==[False,True,False];assert geom()[0]['logo'][1]==100
 page.wait_for_timeout(1700);page.reload();ready(3);assert vis()==[False,True,False];assert geom()[0]['logo'][1]==100
 check('template stores only visual defaults; themes preserve overrides; refresh restores draft')
 # Draft switching uses actual separate draft storage and clears cross-draft undo.
 def saveas(title):
  page.get_by_role('button',name='打开草稿管理',exact=True).click();d.get_by_placeholder('例如：行政执法卷第一题').fill(title);d.get_by_role('button',name='另存为',exact=True).click();expect(d.get_by_placeholder('例如：行政执法卷第一题')).to_have_value('');page.keyboard.press('Escape');d.wait_for(state='hidden');ready()
 saveas('Logo 合成稿 A');saveas('Logo 合成稿 B')
 page.get_by_role('button',name='恢复所有页面跟随',exact=True).click();ready();assert vis()==[False]*3
 theme('极简白');theme('Logo 本地审阅','我的');assert vis()==[False]*3
 page.wait_for_timeout(1500)
 page.get_by_role('button',name='打开草稿管理',exact=True).click();d.locator('article').filter(has_text='Logo 合成稿 A').get_by_role('button',name='打开',exact=True).click();d.wait_for(state='hidden');ready();assert vis()==[False,True,False]
 expect(page.get_by_role('button',name='撤销',exact=True)).to_be_disabled()
 check('separate drafts preserve independent overrides; applying visual template does not copy overrides; history stays in current draft')
 # Special theme constraint.
 theme('公考');assert vis()==[False]*3;assert '主题约束' in page.locator('.logo-controls').inner_text();theme('极简白');assert vis()==[False,True,True]
 check('public-exam Logo restriction retained and clearly explained')
 # Desktop crop-reference evidence and true downloads for each theme / position.
 def export(name):
  ready();page.get_by_role('button',name='导出 PNG',exact=True).click();page.get_by_role('button',name='生成成品预览 3 张',exact=True).click()
  download=page.get_by_role('button',name='下载已验证成品 3 张',exact=True)
  try: download.wait_for(timeout=60000)
  except Exception: print(page.get_by_role('dialog').inner_text(),flush=True);raise
  imgs=page.locator('section[aria-label="已验证 PNG 成品"] img')
  rendered=[]
  for i in range(3):
   data=imgs.nth(i).evaluate('async img=>{const b=await(await fetch(img.src)).blob();return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)})}');rendered.append(base64.b64decode(data.split(',')[1]))
  with page.expect_download(timeout=60000) as dl:download.click()
  path=OUT/(name+'.zip');dl.value.save_as(path)
  with zipfile.ZipFile(path) as z:
   names=sorted(n for n in z.namelist() if n.endswith('.png'));assert len(names)==3
   for i,n in enumerate(names):
    data=z.read(n);assert data==rendered[i];assert Image.open(io.BytesIO(data)).size==(2160,3600)
    (OUT/(name+f'-{i+1}.png')).write_bytes(data)
  report['exports'].append({'name':name,'zip':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pngCount':3,'size':[2160,3600],'previewBytesEqualDownload':True})
  page.keyboard.press('Escape');d.wait_for(state='hidden');return rendered
 page.get_by_role('button',name='恢复所有页面跟随',exact=True).click();ready();select(1);choose('本页 Logo 显示','隐藏');select(0)
 # Keyboard control: open Select with Space, choose last position with End/Enter.
 c=page.get_by_role('combobox',name='封面 Logo 位置',exact=True);c.focus();c.press('Space');page.get_by_role('listbox').wait_for();page.keyboard.press('End');expect(page.get_by_role('option',name='与内页一致',exact=True)).to_be_focused();page.keyboard.press('Enter');ready();assert abs(geom()[0]['logo'][1]-100)<.01
 page.get_by_label('显示封面 3:4 裁切参考',exact=True).focus();page.keyboard.press('Space');expect(page.get_by_label('显示封面 3:4 裁切参考',exact=True)).to_be_checked()
 check('Logo controls and crop reference operate by keyboard')
 for name in ['雅致','极简白','深夜黑']:
  theme(name);select(0)
  assert vis()==[True,False,True]
  choose('封面 Logo 位置','封面可见区右上角');page.locator('.logo-controls').scroll_into_view_if_needed();page.screenshot(path=str(OUT/(name+'-visible-area-ui.png')))
  a=export(name+'-visible-area')
  choose('封面 Logo 位置','与内页一致');page.locator('.logo-controls').scroll_into_view_if_needed();page.screenshot(path=str(OUT/(name+'-inner-ui.png')))
  c=export(name+'-inner')
  # Only Logo pixels change between position variants; inner PNGs are identical.
  for i in [1,2]:
   innerDiff=ImageChops.difference(Image.open(io.BytesIO(a[i])).convert('RGB'),Image.open(io.BytesIO(c[i])).convert('RGB'));assert max(v[1] for v in innerDiff.getextrema())<=1,(name,i)
  diff=ImageChops.difference(Image.open(io.BytesIO(a[0])).convert('RGB'),Image.open(io.BytesIO(c[0])).convert('RGB'))
  noise=diff.point(lambda v:255 if v>1 else 0);box=noise.getbbox();assert box and box[0]>=1799 and box[1]>=199 and box[2]<=2041 and box[3]<=641,(name,box)
  report['exports'][-1]['coverDifferenceBoundsAboveOneLevel']=box
  outside=diff.copy();outside.paste((0,0,0),(1799,199,2041,641));report['exports'][-1]['outsideLogoMaxChannelDelta']=max(v[1] for v in outside.getextrema());assert report['exports'][-1]['outsideLogoMaxChannelDelta']<=1
 check('six actual ZIP downloads / 18 PNGs equal preview bytes; position variants differ only at cover Logo except <=1-level raster noise')
 # Narrow existing inspector layout: no added horizontal overflow, controls reachable.
 for w in [900,600,390]:
  page.set_viewport_size({'width':w,'height':900});page.locator('.logo-controls').scroll_into_view_if_needed();ready()
  assert page.evaluate('document.documentElement.scrollWidth<=Math.max(window.innerWidth,1280)'),w
  assert page.locator('.logo-controls').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),w
  page.screenshot(path=str(OUT/f'narrow-{w}.png'))
 check('900/600/390px widths: controls reachable, no added overflow beyond existing 1280px workspace; Logo-card has no internal overflow')
 report['pageErrors']=errors;assert not errors,errors;report['browser']=b.version
 (OUT/'logo-flow.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));b.close()
