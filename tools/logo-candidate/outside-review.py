import json,base64,zipfile,hashlib,io
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE=Path(__file__).resolve().parents[3];OUT=BASE/'evidence'/'rc2';OUT.mkdir(exist_ok=True)
HTML='<h1>品牌恰好出现</h1><p>封面与完整图片，各有自己的观看方式。</p><hr class="page-break"><h2>这一页隐藏 Logo</h2><p>逐页覆盖保留，正文位置不会跳动。</p><hr class="page-break"><h2>最后一页保留品牌</h2><p>本地合成稿，用于审阅交互和导出。</p>'
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',headless=True,args=['--no-proxy-server']);ctx=b.new_context(viewport={'width':1600,'height':1100},accept_downloads=True)
 ctx.add_init_script('window.showSaveFilePicker=undefined;window.showDirectoryPicker=undefined')
 pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto('http://127.0.0.1:4198/');pg.wait_for_selector('.ProseMirror[contenteditable=true]');pg.wait_for_timeout(500)
 assert pg.evaluate('window.__editor===undefined&&window.__test===undefined')
 ed=pg.locator('.ProseMirror');ed.click();pg.keyboard.press('Meta+a');ed.evaluate('(e,h)=>{const d=new DataTransfer();d.setData("text/html",h);e.dispatchEvent(new ClipboardEvent("paste",{clipboardData:d,bubbles:true,cancelable:true}))}',HTML)
 def ready():pg.wait_for_function('document.querySelectorAll(".page").length===3&&[...document.querySelectorAll(".page")].every(p=>["ready","ready-with-warnings"].includes(p.dataset.layoutState))')
 def select(i):pg.get_by_label('设置当前页').select_option(str(i));ready()
 def choose(label,value):pg.get_by_role('combobox',name=label,exact=True).click();pg.get_by_role('option',name=value,exact=True).click();ready()
 ready();select(1);choose('本页 Logo 显示','隐藏');pg.locator('.logo-controls').scroll_into_view_if_needed();pg.screenshot(path=str(OUT/'review-page-2-override.png'))
 # Keyboard global select, override select and reset button.
 c=pg.get_by_role('combobox',name='整篇显示范围',exact=True);c.focus();c.press('Space');pg.get_by_role('listbox').wait_for();pg.keyboard.press('End');expect(pg.get_by_role('option',name='不显示',exact=True)).to_be_focused();pg.keyboard.press('Enter');ready()
 c=pg.get_by_role('combobox',name='本页 Logo 显示',exact=True);c.focus();c.press('Space');pg.get_by_role('listbox').wait_for();pg.keyboard.press('Home');expect(pg.get_by_role('option',name='跟随整篇设置 · 隐藏',exact=True)).to_be_focused();pg.keyboard.press('ArrowDown');expect(pg.get_by_role('option',name='显示',exact=True)).to_be_focused();pg.keyboard.press('Enter');ready();assert pg.locator('.page').nth(1).get_attribute('data-logo-visible')=='true'
 reset=pg.get_by_role('button',name='恢复所有页面跟随',exact=True);reset.focus();reset.press('Enter');ready();assert pg.locator('.page').nth(1).get_attribute('data-logo-visible')=='false'
 pg.get_by_role('button',name='撤销',exact=True).click();ready();assert pg.locator('.page').nth(1).get_attribute('data-logo-visible')=='true'
 choose('整篇显示范围','每页显示');choose('本页 Logo 显示','隐藏');select(0)
 pg.get_by_label('显示封面 3:4 裁切参考',exact=True).check()
 def geometry():
  return pg.locator('.page').evaluate_all("pages=>pages.map(p=>{const r=p.getBoundingClientRect(),l=p.querySelector('.logo').getBoundingClientRect(),s=r.width/1080;return {top:Math.round((l.top-r.top)/s),bottom:Math.round((l.bottom-r.top)/s),right:Math.round((r.right-l.right)/s),width:Math.round(l.width/s),content:p.querySelector('.content').innerHTML}})")
 before=geometry();results=[]
 for position,name in [('封面可见区右上角','review-visible-area'),('与内页一致','review-inner'),('封面可见范围外右上角','review-outside')]:
  choose('封面 Logo 位置',position);g=geometry();assert g[0]['top']=={'review-visible-area':200,'review-inner':100,'review-outside':55}[name];assert g[0]['right']==60 and g[0]['width']==120;assert [v['content'] for v in g]==[v['content'] for v in before];assert g[1:]==before[1:];pg.locator('.logo-controls').scroll_into_view_if_needed();pg.screenshot(path=str(OUT/(name+'.png')))
  # Wait for the raster product, inspect the actual downloaded ZIP/PNG.
  pg.get_by_role('button',name='导出 PNG',exact=True).click();pg.get_by_role('button',name='生成成品预览 3 张',exact=True).click();dl=pg.get_by_role('button',name='下载已验证成品 3 张',exact=True);dl.wait_for(timeout=60000)
  data=pg.locator('section[aria-label="已验证 PNG 成品"] img').evaluate_all('async imgs=>Promise.all(imgs.map(async img=>{const b=await(await fetch(img.src)).blob();return new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)})}))')
  pg.screenshot(path=str(OUT/(name+'-export-dialog.png')))
  with pg.expect_download(timeout=60000) as download:dl.click()
  path=OUT/(name+'.zip');download.value.save_as(path)
  with zipfile.ZipFile(path) as z:
   names=sorted(n for n in z.namelist() if n.endswith('.png'));assert len(names)==3
   for i,n in enumerate(names):
    raw=z.read(n);assert raw==base64.b64decode(data[i].split(',')[1]);assert Image.open(io.BytesIO(raw)).size==(2160,3600);(OUT/(name+f'-export-{i+1}.png')).write_bytes(raw)
  results.append({'position':position,'zip':path.name,'pngCount':3,'allPreviewBytesEqualDownloads':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
  pg.keyboard.press('Escape');pg.get_by_role('dialog').wait_for(state='hidden')
 pg.wait_for_timeout(1500);pg.reload();pg.wait_for_selector('.ProseMirror[contenteditable=true]');ready();assert pg.locator('.page').first.get_attribute('data-cover-logo-position')=='outside-area';assert pg.locator('.page').nth(1).get_attribute('data-logo-visible')=='false'
 # History, hide/show preservation, keyboard new option, template default and thumbnail.
 select(0);choose('封面 Logo 位置','与内页一致')
 pg.get_by_role('button',name='撤销',exact=True).click();ready();assert geometry()[0]['top']==55
 pg.get_by_role('button',name='重做',exact=True).click();ready();assert geometry()[0]['top']==100
 c=pg.get_by_role('combobox',name='封面 Logo 位置',exact=True);c.focus();c.press('Space');pg.get_by_role('listbox').wait_for();pg.keyboard.press('End');expect(pg.get_by_role('option',name='封面可见范围外右上角',exact=True)).to_be_focused();pg.keyboard.press('Enter');ready();assert geometry()[0]['top']==55
 beforeHide=geometry();choose('本页 Logo 显示','隐藏');assert geometry()==beforeHide;choose('本页 Logo 显示','显示');assert geometry()==beforeHide
 pg.get_by_role('button',name='主题库',exact=True).click();d=pg.get_by_role('dialog');d.get_by_role('tab',name='我的',exact=True).click();d.get_by_placeholder('主题名称').fill('范围外本地合成模板');d.get_by_role('button',name='保存',exact=True).click();pg.wait_for_timeout(500);pg.keyboard.press('Escape');d.wait_for(state='hidden')
 choose('封面 Logo 位置','封面可见区右上角')
 pg.get_by_role('button',name='主题库',exact=True).click();d=pg.get_by_role('dialog');d.get_by_role('tab',name='我的',exact=True).click();card=d.locator('[data-theme-id]').filter(has_text='范围外本地合成模板');expect(card.locator('[data-cover-logo-position="outside-area"]')).to_have_count(1)
 thumb=card.locator('.page .logo').evaluate('e=>getComputedStyle(e).top');assert thumb=='55px',thumb
 card.get_by_role('button',name='应用',exact=True).click();d.wait_for(state='hidden');ready();assert geometry()[0]['top']==55;assert pg.locator('.page').nth(1).get_attribute('data-logo-visible')=='false'
 narrow=[]
 for width in [900,600,390]:
  pg.set_viewport_size({'width':width,'height':900});pg.locator('.logo-controls').scroll_into_view_if_needed();m=pg.locator('.logo-controls').evaluate('e=>({scroll:e.scrollWidth,client:e.clientWidth,document:document.documentElement.scrollWidth})');assert m['scroll']<=m['client'] and m['document']<=1280,m;narrow.append({'width':width,**m})
 pg.screenshot(path=str(OUT/'narrow-390.png'));pg.set_viewport_size({'width':1600,'height':1100})
 # Store synthetic review draft for optional handoff replay (no personal content).
 ctx.storage_state(path=str(OUT/'synthetic-review-state.json'),indexed_db=True)
 assert not errors,errors
 (OUT/'build-review.json').write_text(json.dumps({'browser':b.version,'url':'http://127.0.0.1:4198/','noDevHooks':True,'keyboardGlobalPageAndReset':True,'refresh':True,'outsidePositionHistoryHideShowTemplateKeyboard':True,'narrow':narrow,'exports':results,'pageErrors':errors},ensure_ascii=False,indent=2))
 print('PASS built candidate: real paste, keyboard controls, override screenshot, three crop-reference positions, 9 actual PNG downloads, refresh, outside history/hide/show/template/keyboard/narrow',flush=True)
 b.close()
