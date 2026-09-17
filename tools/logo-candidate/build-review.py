import json,base64,zipfile,hashlib,io
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE=Path(__file__).resolve().parents[3];OUT=BASE/'evidence'
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
 results=[]
 for position,name in [('封面可见区右上角','review-visible-area'),('与内页一致','review-inner')]:
  choose('封面 Logo 位置',position);pg.locator('.logo-controls').scroll_into_view_if_needed();pg.screenshot(path=str(OUT/(name+'.png')))
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
 pg.wait_for_timeout(1500);pg.reload();pg.wait_for_selector('.ProseMirror[contenteditable=true]');ready();assert pg.locator('.page').first.get_attribute('data-cover-logo-position')=='inner';assert pg.locator('.page').nth(1).get_attribute('data-logo-visible')=='false'
 # Store synthetic review draft for optional handoff replay (no personal content).
 ctx.storage_state(path=str(OUT/'synthetic-review-state.json'),indexed_db=True)
 assert not errors,errors
 (OUT/'build-review.json').write_text(json.dumps({'browser':b.version,'url':'http://127.0.0.1:4198/','noDevHooks':True,'keyboardGlobalPageAndReset':True,'refresh':True,'exports':results,'pageErrors':errors},ensure_ascii=False,indent=2))
 print('PASS built candidate: real paste, keyboard controls, override screenshot, two crop-reference positions, 6 actual PNG downloads, refresh',flush=True)
 b.close()
