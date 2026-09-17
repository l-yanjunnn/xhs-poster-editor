from playwright.sync_api import sync_playwright
import json
from pathlib import Path
OUT=Path(__file__).resolve().parents[3]/'evidence'
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',headless=True,args=['--no-proxy-server']);out=[]
 for url,label in [('http://127.0.0.1:4199/','baseline'),('http://127.0.0.1:4198/','candidate')]:
  pg=b.new_page(viewport={'width':1600,'height':1100});pg.goto(url);pg.wait_for_selector('.ProseMirror[contenteditable=true]');pg.wait_for_timeout(1000)
  for w in [900,600,390]:
   pg.set_viewport_size({'width':w,'height':900});pg.wait_for_timeout(400)
   m=pg.evaluate('''()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&!e.closest('.page-stage')&&!e.closest('.canvas-interaction-layer')}).slice(0,20).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))})''')
   if label=='candidate':
    pg.locator('.logo-controls').scroll_into_view_if_needed();m['logo']=pg.locator('.logo-controls').evaluate('e=>({scroll:e.scrollWidth,client:e.clientWidth})');pg.screenshot(path=str(OUT/f'narrow-{w}.png'))
   out.append({'version':label,**m})
  pg.close()
 (OUT/'narrow-comparison.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False),flush=True);b.close()
