"""Home integration, real DOM/timers/touch gestures, isolated collection fixtures.
Run with the static server on localhost:8000.
"""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8000'
NOW=int(time.time()*1000)
DATA={'channels':[{'id':'ch','name':'Classic Channel','num':'62'}],
 'items':[{'id':'series','title':'Owned Series','type':'show','channel':'ch','owned':True,'ripped':False,'added':True},
 {'id':'season-show','title':'Season Owned Show','type':'show','channel':'ch','owned':False},
 {'id':'episode-show','title':'Episode Owned Show','type':'show','channel':'ch','owned':False},
 {'id':'movie','title':'Owned Film','type':'movie','owned':True,'ripped':True,'added':False},
 {'id':'unowned','title':'Unowned Film','type':'movie','owned':False},
 {'id':'folder','title':'My Box Set','type':'movie','owned':True},
 {'id':'emptybox','title':'Empty Collection','type':'movie','owned':True}],
 'collectionChildren':[{'id':'s1','parentId':'season-show','title':'Season 1','owned':True,'ripped':False},
 {'id':'e1','parentId':'episode-show','title':'Season 1','owned':False},
 {'id':'child','parentId':'folder','title':'Owned Child','owned':True,'ripped':True,'added':True},
 {'id':'other','parentId':'folder','title':'Unowned Child','owned':False}],
 'showDetails':{'series':{'description':'My manual series description','manualFields':['description'],'tmdb':{'poster':'https://art.test/source.svg','backdrop':'https://art.test/backdrop.svg'},'metadataLookup':{'status':'ok','updatedAt':NOW-60000}},
 'episode-show':{'episodes':{'e1':[{'id':'ep','title':'My custom episode','owned':True,'ripped':False,'added':True,'customTitle':True}]}}},
 'movieDetails':{'movie':{'tmdb':{'backdrop':'https://art.test/broken-backdrop.jpg','poster':'https://art.test/broken.jpg'}}},'deletedMovieChildren':{},'custom':{'keep':'unknown data'}}
POSTERS={'series':'https://art.test/manual.svg','movie':'https://art.test/broken.jpg'}
TIMER_SCRIPT='''window.carouselTimers=new Set();const st=window.setTimeout.bind(window),ct=window.clearTimeout.bind(window);
window.setTimeout=(fn,ms,...args)=>{let handle;handle=st(()=>{carouselTimers.delete(handle);fn(...args)},ms);if(ms===6000)carouselTimers.add(handle);return handle};
window.clearTimeout=handle=>{carouselTimers.delete(handle);ct(handle)};'''
SVG='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#164f95"/><circle cx="1050" cy="240" r="160" fill="#ffd15a"/></svg>'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(1280,1000)]:
  context=browser.new_context(viewport={'width':width,'height':height},has_touch=True,is_mobile=width<600)
  context.add_init_script("if(!localStorage.getItem('comcast-collection-v1')){localStorage.setItem('comcast-collection-v1',"+json.dumps(json.dumps(DATA))+");localStorage.setItem('comcast-posters-v1',"+json.dumps(json.dumps(POSTERS))+");localStorage.setItem('comcast-manual-posters-v1','[\"series\"]')}")
  context.add_init_script(TIMER_SCRIPT)
  art_requests=[]
  def artwork(route):
   art_requests.append(route.request.url)
   route.fulfill(status=404 if 'broken' in route.request.url else 200,body='' if 'broken' in route.request.url else SVG,content_type='image/svg+xml')
  context.route('https://art.test/**',artwork)
  context.route('https://posters.thomasboydspam.workers.dev/**',lambda r:r.fulfill(json={'results':[]}))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  def home():
   page.goto(BASE,wait_until='domcontentloaded');page.evaluate('metadata.stop()');page.mouse.move(0,0)
  def feature(title):page.get_by_role('button',name='Feature '+title,exact=True).click()
  def blur():page.evaluate("document.activeElement.blur();document.querySelector('.home-feature').dispatchEvent(new PointerEvent('pointerleave',{pointerType:'mouse'}))");page.mouse.move(0,0)
  def count():return page.evaluate('carouselTimers.size')
  home();assert page.locator('#homeTab').get_attribute('class')=='active'
  baseline=page.evaluate("localStorage.getItem('comcast-collection-v1')")
  assert page.locator('.home-indicator').count()==5
  assert page.locator('.home-feature-art img').get_attribute('src')=='https://art.test/backdrop.svg'
  assert 'On Your Shelves' in page.locator('.home-screen').inner_text();assert 'Explore Your Collection' in page.locator('.home-screen').inner_text()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert count()==1
  # A real six-second timer advances automatically before any interaction.
  if width==390:
   key=page.locator('.home-feature-card').get_attribute('data-record-key')
   page.wait_for_function('key=>document.querySelector(".home-feature-card").dataset.recordKey!==key',arg=key,timeout=7500)
  feature('Season Owned Show');assert page.locator('.home-ownership').inner_text()=='1 season marked Owned'
  feature('Episode Owned Show');assert page.locator('.home-ownership').inner_text()=='1 episode marked Owned'
  assert page.evaluate("localStorage.getItem('comcast-collection-v1')")==baseline
  page.locator('.home-feature-card').press('Enter');page.wait_for_url('**/show.html?id=episode-show');page.evaluate('metadata.stop()')
  assert json.loads(page.evaluate("sessionStorage.getItem('comcast-navigation-v2')"))['tab']=='home'
  home();feature('Owned Child');page.locator('.home-feature-card').click();page.wait_for_url('**/movie.html?id=child&parent=folder');page.evaluate('metadata.stop()')
  home();feature('Owned Film');page.locator('.home-feature-card').click();page.wait_for_url('**/movie.html?id=movie');page.evaluate('metadata.stop()')
  page.go_back(wait_until='domcontentloaded');page.evaluate('metadata.stop()');assert page.locator('#homeTab').get_attribute('class')=='active'
  blur();assert count()==1
  # Missing images fall back once and are not retried by metadata-style rerenders.
  art_requests.clear();home();feature('Owned Film');page.wait_for_function("!document.querySelector('.home-feature-art img')")
  broken_before={url:art_requests.count(url) for url in set(art_requests) if 'broken' in url}
  page.evaluate('render();render();render()');feature('Owned Film')
  assert {url:art_requests.count(url) for url in broken_before}==broken_before
  assert all(n<=3 for n in broken_before.values())
  # Hover/focus, explicit pause, hidden pages, reduced motion, and rerender cleanup.
  blur();assert count()==1
  page.get_by_role('button',name='Pause automatic carousel',exact=True).click();assert count()==0
  page.evaluate('render()');assert count()==0
  page.get_by_role('button',name='Resume automatic carousel',exact=True).click();assert count()==1
  blur();page.evaluate("window.testHidden=true;Object.defineProperty(document,'hidden',{get:()=>testHidden,configurable:true});document.dispatchEvent(new Event('visibilitychange'))");assert count()==0
  page.evaluate("testHidden=false;document.dispatchEvent(new Event('visibilitychange'))");assert count()==1
  page.emulate_media(reduced_motion='reduce');page.wait_for_function('carouselTimers.size===0')
  assert page.get_by_role('button',name='Automatic carousel disabled for reduced motion').is_disabled()
  page.emulate_media(reduced_motion='no-preference');page.wait_for_function('carouselTimers.size===1')
  page.evaluate('render();render();render()');assert count()==1
  # Horizontal swipe advances without accidentally activating the card.
  card=page.locator('.home-feature-card');card.scroll_into_view_if_needed();r=card.bounding_box();key=card.get_attribute('data-record-key');session=context.new_cdp_session(page)
  y=max(20,min(height-40,r['y']+100));start=r['x']+r['width']*.8;end=r['x']+r['width']*.2
  session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start,'y':y}]})
  for i in range(1,9):session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':start+(end-start)*i/8,'y':y}]})
  session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  assert card.get_attribute('data-record-key')!=key;assert page.url==BASE+'/'
  page.get_by_role('button',name='Next featured title').click();page.get_by_role('button',name='Previous featured title').click()
  if width==390:
   page.evaluate("document.getAnimations().forEach(a=>a.finish());window.scrollTo(0,0)");page.screenshot(path='/tmp/comcast-home-phone.png',full_page=True)
  # Home adds no fields/timestamps and keeps backup/restore records compatible.
  saved=json.loads(page.evaluate("localStorage.getItem('comcast-collection-v1')"))
  assert saved['items']==DATA['items'];assert saved['collectionChildren']==DATA['collectionChildren'];assert saved['channels']==DATA['channels'];assert saved['custom']==DATA['custom']
  assert saved['showDetails']['episode-show']['episodes']==DATA['showDetails']['episode-show']['episodes']
  page.get_by_role('button',name='⚙ Tools',exact=True).click()
  with page.expect_download() as download:page.get_by_role('button',name='Backup',exact=True).click()
  exported=json.loads(Path(download.value.path()).read_text());assert exported['items']==DATA['items'];assert exported['collectionChildren']==DATA['collectionChildren'];assert exported['showDetails']==saved['showDetails'];assert exported['posters']==POSTERS
  exported['restoreRoundTrip']='verified'
  page.locator('#restoreFile').set_input_files({'name':'restore.json','mimeType':'application/json','buffer':json.dumps(exported).encode()})
  page.wait_for_function("JSON.parse(localStorage.getItem('comcast-collection-v1')).restoreRoundTrip==='verified'")
  page.locator('#guideTab').click();assert count()==0;assert page.locator('[data-channel-id="ch"]').count()==1
  page.locator('#movieTab').click();assert 'My Box Set' in page.locator('#content').inner_text()
  page.locator('#dashboardTab').click();assert 'Collection Dashboard' in page.locator('#content').inner_text()
  page.locator('#search').fill('Owned Child');assert 'Owned Child' in page.locator('#content').inner_text();assert page.locator('#searchSuggestions').is_visible()
  page.get_by_role('button',name='Clear search',exact=True).click();assert 'Collection Dashboard' in page.locator('#content').inner_text()
  assert not errors,errors
  print(f'PASS {width}px Home: ownership, navigation, artwork fallback, pause/reduced motion, swipe, timer cleanup, backup/restore and existing sections')
  context.close()
 # Empty/singleton/no-history/fresh/corrupt storage do not seed or replace a collection.
 for case in ['empty','one','fresh','corrupt']:
  context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  if case!='fresh':
   raw='{not valid json' if case=='corrupt' else json.dumps({'channels':[],'items':[] if case=='empty' else [{'id':'only','title':'Only Film','type':'movie','owned':True}],'collectionChildren':[]})
   context.add_init_script("localStorage.setItem('comcast-collection-v1',"+json.dumps(raw)+")")
  context.add_init_script(TIMER_SCRIPT)
  page=context.new_page();page.goto(BASE,wait_until='domcontentloaded');page.evaluate('metadata.stop()')
  assert page.evaluate('carouselTimers.size')==0
  if case in ['empty','fresh','corrupt']:assert page.locator('.home-feature-empty').is_visible()
  if case=='one':assert page.locator('.home-indicator').count()==1;assert page.get_by_role('button',name='Next featured title').is_disabled()
  if case=='corrupt':assert page.evaluate("localStorage.getItem('comcast-collection-v1')")==raw
  if case=='fresh':assert page.evaluate("JSON.parse(localStorage.getItem('comcast-collection-v1')).items.length")==0
  assert 'Recently Updated' not in page.locator('.home-screen').inner_text()
  print('PASS Home edge case:',case)
  context.close()
 browser.close()

