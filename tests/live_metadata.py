"""Live browser checks. Use --curl-transport for this cloud's browser CA limitation.
Every bridged request hits the real Worker using curl's verified TLS; no fixtures.
Run with the static server on http://127.0.0.1:8000.
"""
import argparse
import json
import subprocess
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--curl-transport',action='store_true')
args=parser.parse_args()
base='http://127.0.0.1:8000'
initial={'channels':[{'id':'c','name':'Live Check','num':'42'}],
 'items':[{'id':'existing','title':'Blade Runner (1982)','type':'movie','owned':True,'ripped':False,'added':True},
          {'id':'box','title':'Live Check Box Set','type':'movie'}],
 'collectionChildren':[], 'movieDetails':{'existing':{'description':'Keep my manual text','manualFields':['description']}},'showDetails':{}}
requests=[];failures=[]
def bridge(route):
 requests.append(route.request.url)
 result=subprocess.run(['curl','--silent','--show-error','--fail-with-body','--max-time','25',route.request.url],capture_output=True)
 if result.returncode:
  failures.append(result.stderr.decode());route.fulfill(status=502,body='Live transport failed');return
 # Require actual JSON responses rather than treating proxy HTML as valid metadata.
 json.loads(result.stdout)
 route.fulfill(status=200,body=result.stdout,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'})
def wait(page,title):
 page.wait_for_function('''title=>{const d=JSON.parse(localStorage.getItem('comcast-collection-v1'));const x=[...d.items,...d.collectionChildren].find(x=>x.title===title);return x&&(d.movieDetails?.[x.id]||d.showDetails?.[x.id])?.metadataLookup?.status==='ok'}''',arg=title,timeout=60000)
 print('PASS real Worker metadata:',title,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context()
 context.add_init_script("if(!localStorage.getItem('comcast-collection-v1'))localStorage.setItem('comcast-collection-v1',"+json.dumps(json.dumps(initial))+")")
 if args.curl_transport: context.route('https://posters.thomasboydspam.workers.dev/**',bridge)
 # Images are tested separately via verified curl; don't confuse a browser trust
 # error in this cloud with a metadata matching failure.
 context.route('https://image.tmdb.org/**',lambda route:route.abort())
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);wait(page,'Blade Runner (1982)')
 page.locator('#movieTab').click();page.once('dialog',lambda d:d.accept('The Grand Budapest Hotel (2014)'));page.get_by_role('button',name='+ Add Movie / Collection',exact=True).click();wait(page,'The Grand Budapest Hotel (2014)')
 page.locator('#guideTab').click();page.locator('.cardhead').click();page.once('dialog',lambda d:d.accept('Severance (2022)'));page.get_by_role('button',name='+ Add Show',exact=True).click();wait(page,'Severance (2022)')
 page.goto(base+'/movie.html?id=box');page.once('dialog',lambda d:d.accept('The Iron Giant (1999)'));page.locator('#addMovie').click();wait(page,'The Iron Giant (1999)')
 data=page.evaluate("JSON.parse(localStorage.getItem('comcast-collection-v1'))")
 assert data['movieDetails']['existing']['description']=='Keep my manual text'
 for name,title,expected_id in [('movie','The Grand Budapest Hotel (2014)',120467),('show','Severance (2022)',95396),('movie','The Iron Giant (1999)',10386)]:
  item=next(x for x in data['items']+data['collectionChildren'] if x['title']==title)
  d=data['showDetails' if name=='show' else 'movieDetails'][str(item['id'])]
  assert d['tmdbId']==expected_id,(title,d)
  assert d['description'] and d['year'] and d['genres']
  if name=='movie':assert d['runtime']
 child=next(x for x in data['collectionChildren'] if x['title']=='The Iron Giant (1999)')
 page.goto(base+'/movie.html?id='+str(child['id'])+'&parent=box');assert '1999' in page.locator('#meta').inner_text();assert 'minutes' in page.locator('#meta').inner_text()
 page.reload();assert page.locator('#description').inner_text()
 posters=page.evaluate("JSON.parse(localStorage.getItem('comcast-posters-v1'))")
 for poster in set(posters.values()):
  result=subprocess.run(['curl','--silent','--show-error','--fail','--max-time','25',poster],capture_output=True)
  assert result.returncode==0 and len(result.stdout)>1000,'Poster download failed'
 assert not failures,failures
 assert not errors,errors
 print('PASS live detail display, reload, verified IDs, manual text, and',len(posters),'poster downloads;',len(requests),'real Worker requests',flush=True)
 browser.close()
