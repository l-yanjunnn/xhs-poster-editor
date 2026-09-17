import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
OUT=Path(__file__).resolve().parents[3]/'evidence'
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',headless=True,args=['--no-proxy-server']);pg=b.new_page(viewport={'width':1600,'height':1100});pg.add_init_script('window.showSaveFilePicker=undefined;window.showDirectoryPicker=undefined');pg.goto('http://127.0.0.1:4197/');pg.wait_for_selector('.ProseMirror[contenteditable=true]');pg.wait_for_timeout(400)
 pg.evaluate('window.__editor.commands.setContent("<h1>合成封面</h1><p>检查显隐变化后成品失效。</p>")')
 pg.wait_for_function('document.querySelectorAll(".page").length===1&&document.querySelector(".page").dataset.layoutState==="ready"')
 pg.get_by_role('button',name='导出 PNG',exact=True).click();pg.get_by_role('button',name='生成成品预览 1 张',exact=True).click();pg.get_by_role('button',name='下载已验证成品 1 张',exact=True).wait_for(timeout=60000)
 before=pg.locator('.page').first.get_attribute('data-layout-snapshot')
 pg.evaluate('()=>{const e=window.__editor;e.view.dispatch(e.state.tr.setDocAttribute("logoSettings",{...e.state.doc.attrs.logoSettings,strategy:"every",coverPosition:"visible-area",coverVisibility:"hide"}))}')
 expect(pg.get_by_role('button',name='下载已验证成品 1 张',exact=True)).to_have_count(0)
 expect(pg.locator('section[aria-label="已验证 PNG 成品"]')).to_have_count(0)
 assert pg.locator('.page').first.get_attribute('data-layout-snapshot')==before
 (OUT/'export-freshness.json').write_text(json.dumps({'coverOverrideInvalidatesPreparedPNG':True,'textSnapshotUnchanged':True,'browser':b.version},indent=2))
 print('PASS cover-only override invalidates prepared PNG without recomputing text',flush=True);b.close()
