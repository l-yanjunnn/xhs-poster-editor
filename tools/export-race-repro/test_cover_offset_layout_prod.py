"""Real production UI, isolated synthetic draft, 9 cover layouts/positions, actual PNGs."""
import argparse,base64,json,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('url');parser.add_argument('version');parser.add_argument('--out',type=Path,required=True);args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',proxy={'server':'http://127.0.0.1:7897'} if 'workers.dev' in args.url else None);page=b.new_page(viewport={'width':1536,'height':1100},reduced_motion='reduce');page.add_init_script('window.showDirectoryPicker=undefined;window.showSaveFilePicker=undefined')
 page.goto(args.url);page.wait_for_selector('.ProseMirror[contenteditable=true]');assert page.locator('.topbar-version').inner_text()==args.version
 page.get_by_role('button',name='导入文稿',exact=True).click();d=page.get_by_role('dialog');d.get_by_role('tab',name='粘贴全文',exact=True).click();d.get_by_role('textbox',name='粘贴整篇文稿',exact=True).fill('# 封面\n## 封面位置测试\n\n## 文字与成品一致\n\n中文 English 100% “引号” 与数字。\n\n---\n\n## 独立内页\n\n内页内容与位置应保持不变。\n\n# 正文\n合成验收');d.get_by_role('button',name='解析并预览',exact=True).click();d.get_by_role('button',name='生成到新草稿',exact=True).click();d.wait_for(state='hidden')
 def ready():page.wait_for_function('[...document.querySelectorAll(".page")].length===2&&[...document.querySelectorAll(".page")].every(p=>["ready","ready-with-warnings"].includes(p.dataset.layoutState))')
 def geom():
  ready();page.wait_for_timeout(250)
  return page.locator('.page').evaluate_all('(ps)=>ps.map(p=>{const r=p.getBoundingClientRect(),s=r.width/1080;return [...p.querySelectorAll(".content > *")].map(e=>{let x=e.getBoundingClientRect();return {text:e.textContent,y:(x.top-r.top)/s,height:x.height/s,font:getComputedStyle(e).font}})})')
 cases=[]
 for layout in ['左对齐叠排','居中海报','小字在上大字在下']:
  page.get_by_role('group',name='封面版式',exact=True).get_by_role('button',name=layout,exact=True).click()
  for label in ['上','中','下']:
   page.get_by_role('group',name='垂直位置',exact=True).get_by_role('button',name=label,exact=True).click();slider=page.get_by_label('封面顶部偏移',exact=True);slider.fill('0');base=geom()
   measurements=[]
   for offset in [-80,80,-80]:
    slider.fill(str(offset));actual=geom();deltas=[a['y']-e['y'] for e,a in zip(base[0],actual[0])];assert all(abs(v-offset)<.1 for v in deltas),(layout,label,offset,deltas);assert all(a['text']==e['text'] and a['font']==e['font'] and abs(a['y']-e['y'])<.1 and abs(a['height']-e['height'])<.1 for a,e in zip(actual[1],base[1])),('inner changed',actual[1],base[1]);assert all(abs(a['height']-e['height'])<.1 for a,e in zip(actual[0],base[0])),('height changed',actual[0],base[0]);measurements.append({'offset':offset,'blockDeltas':deltas})
   page.get_by_role('button',name='导出 PNG',exact=True).click();d.get_by_role('tab',name='选择页码导出',exact=False).click();d.get_by_label('页码范围').fill('1');d.get_by_role('button',name='生成成品预览 1 张',exact=True).click();d.get_by_role('button',name='下载已验证成品 1 张',exact=True).wait_for(timeout=120000)
   image=d.locator('section[aria-label="已验证 PNG 成品"] img');raw=base64.b64decode(image.evaluate('async(i)=>{let a=new Uint8Array(await(await fetch(i.src)).arrayBuffer());let s="";for(let b of a)s+=String.fromCharCode(b);return btoa(s)}'))
   filename=f'{len(cases)+1:02d}-cover.png';(args.out/filename).write_bytes(raw);cases.append({'layout':layout,'alignment':label,'measurements':measurements,'png':filename,'sha256':hashlib.sha256(raw).hexdigest()});print(layout,label,'±80px exact; PNG verified',flush=True);page.keyboard.press('Escape');d.wait_for(state='hidden')
 result={'url':args.url,'version':args.version,'browser':b.version,'bundle':page.evaluate('[...document.scripts].map(s=>s.src).find(s=>s.includes("/assets/index-"))'),'cases':cases};(args.out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));b.close()
