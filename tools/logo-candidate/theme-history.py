from playwright.sync_api import sync_playwright,expect
import json
from pathlib import Path
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',headless=True,args=['--no-proxy-server']);pg=b.new_page(viewport={'width':1600,'height':1100});pg.goto('http://127.0.0.1:4197/');pg.wait_for_selector('.ProseMirror[contenteditable=true]');pg.wait_for_timeout(600)
 expect(pg.get_by_role('button',name='撤销',exact=True)).to_be_disabled()
 pg.get_by_role('button',name='主题库',exact=True).click();d=pg.get_by_role('dialog');d.get_by_role('tab',name='内置',exact=True).click();d.locator('[data-theme-id]').filter(has_text='极简白').get_by_role('button',name='应用',exact=True).click();d.wait_for(state='hidden');pg.wait_for_timeout(400)
 expect(pg.get_by_role('button',name='撤销',exact=True)).to_be_disabled()
 pg.get_by_role('combobox',name='本页 Logo 显示',exact=True).click();pg.get_by_role('option',name='隐藏',exact=True).click();expect(pg.locator('.page').first).to_have_attribute('data-logo-visible','false');pg.get_by_role('button',name='撤销',exact=True).click();expect(pg.locator('.page').first).to_have_attribute('data-logo-visible','true')
 (Path(__file__).resolve().parents[3]/'evidence/theme-history.json').write_text(json.dumps({'themeApplyKeepsExistingNonHistorySemantics':True,'manualOverrideUndoWorks':True},indent=2));print('PASS theme defaults do not create a new undo step; manual override does',flush=True);b.close()
