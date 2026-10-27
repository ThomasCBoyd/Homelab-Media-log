"""Run with the static server on port 8000: python3 tests/browser_search.py."""
import json
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8000'
DATA={'channels':[{'id':'ch','name':'Cartoon Network','num':'62'},{'id':'empty','name':'Empty Channel','num':'777'}],
 'items':[{'id':'tv','title':'Example Show','type':'show','channel':'ch','owned':True,'ripped':True,'added':False},
          {'id':'movie','title':'Example Film','type':'movie','owned':True,'ripped':False,'added':True},
          {'id':'box','title':'Example Collection','type':'movie'},
          *[{'id':f'm{i}','title':f'Example Extra {i}','type':'movie'} for i in range(10)]],
 'collectionChildren':[{'id':'child','title':'Exact Child Film','parentId':'box','owned':True,'ripped':True,'added':True},
                       {'id':'season','title':'Example Show Season 2','parentId':'tv','owned':True}],
 'movieDetails':{},'showDetails':{'tv':{'description':'Keep TV metadata','manualFields':['description'],'episodes':{'season':[]}}},'deletedMovieChildren':{},'custom':{'preserve':True}}
POSTERS={'movie':'https://example.org/poster.jpg'}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height,touch in [(1280,900,False),(390,844,True),(820,1180,True)]:
  context=browser.new_context(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch)
  context.add_init_script("if(!localStorage.getItem('comcast-collection-v1')){localStorage.setItem('comcast-collection-v1',"+json.dumps(json.dumps(DATA))+");localStorage.setItem('comcast-posters-v1',"+json.dumps(json.dumps(POSTERS))+")}")
  context.route('https://posters.thomasboydspam.workers.dev/**',lambda r:r.fulfill(json={'results':[]}))
  context.route('https://example.org/**',lambda r:r.abort())
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def home():
   page.goto(BASE,wait_until='domcontentloaded');page.evaluate('metadata.stop()')
  def fill(text):
   page.locator('#search').fill(text)
  def select(text):
   option=page.locator('#searchSuggestions').get_by_role('option').filter(has_text=text).first
   if touch:option.tap()
   else:option.click()
  home();search=page.locator('#search');clear=page.get_by_role('button',name='Clear search',exact=True)
  baseline=page.evaluate("localStorage.getItem('comcast-collection-v1')")
  assert not clear.is_visible()
  assert page.get_by_role('combobox',name='Search your collection and Comcast channels').count()==1
  for query,title,category in [('Example Film','Example Film','Movie / Collection'),('Example Show','Example Show','TV Show · Cartoon Network 62'),('Exact Child','Exact Child Film','Movie · Example Collection'),('Season 2','Example Show Season 2','Season · Example Show'),('Cartoon','Cartoon Network','Channel · 62'),('62','Cartoon Network','Channel · 62'),('777','Empty Channel','Channel · 777')]:
   fill(query);assert page.locator('#searchSuggestions').get_by_role('option').filter(has=page.get_by_text(title,exact=True)).count()==1
   assert category in page.locator('#searchSuggestions').get_by_role('option').filter(has=page.get_by_text(title,exact=True)).inner_text()
   assert search.get_attribute('aria-expanded')=='true'
   assert clear.is_visible()
  fill('Example');assert page.locator('#searchSuggestions').get_by_role('option').count()==8,(page.locator('#searchSuggestions').inner_html(),errors)
  assert 'Search results' in page.locator('#content').inner_text()
  # All dropdown hit targets stay within the viewport and paint above following controls.
  assert page.evaluate('''()=>{const list=document.querySelector('#searchSuggestions'),r=list.getBoundingClientRect();const input=document.querySelector('#search').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>input.bottom&&list.contains(document.elementFromPoint(r.left+20,r.top+20))}''')
  search.press('ArrowDown');first=search.get_attribute('aria-activedescendant');assert first
  assert page.locator('#'+first).get_attribute('aria-selected')=='true'
  search.press('ArrowDown');assert search.get_attribute('aria-activedescendant')!=first
  search.press('Escape');assert not page.locator('#searchSuggestions').is_visible();assert search.input_value()=='Example'
  search.press('ArrowUp');assert page.locator('#searchSuggestions').is_visible()
  search.press('Tab');assert not page.locator('#searchSuggestions').is_visible()
  search.focus();assert page.locator('#searchSuggestions').is_visible()
  page.locator('h1').click();assert not page.locator('#searchSuggestions').is_visible()
  fill('nonsense-no-match');assert not page.locator('#searchSuggestions').is_visible();assert 'No matches' in page.locator('#content').inner_text()
  # Clear restores the current tab rather than replacing its data or routing elsewhere.
  page.locator('#dashboardTab').click();fill('Example');clear.click()
  assert search.input_value()=='';assert not clear.is_visible();assert not page.locator('#searchSuggestions').is_visible()
  assert 'Collection Dashboard' in page.locator('#content').inner_text()
  assert page.evaluate("localStorage.getItem('comcast-collection-v1')")==baseline
  assert page.evaluate("JSON.parse(localStorage.getItem('comcast-posters-v1'))")==POSTERS
  fill('Exact Child');select('Exact Child Film');page.wait_for_url('**/movie.html?id=child&parent=box');page.evaluate('metadata.stop()')
  assert page.locator('#title').inner_text()=='Exact Child Film'
  home();assert clear.is_visible() # restored query has its clear control
  fill('Example Film');search.press('ArrowDown');search.press('Enter');page.wait_for_url('**/movie.html?id=movie');page.evaluate('metadata.stop()')
  home();fill('Example Show');select('TV Show');page.wait_for_url('**/show.html?id=tv');page.evaluate('metadata.stop()')
  home();fill('Season 2');select('Season ·');page.wait_for_url('**/show.html?id=tv');page.evaluate('metadata.stop()')
  home();page.locator('#dashboardTab').click();fill('62');select('Channel · 62')
  assert search.input_value()=='';assert page.locator('#guideTab').get_attribute('class')=='active'
  assert page.locator('[data-channel-id="ch"] .list-items').is_visible()
  assert page.evaluate("document.activeElement.closest('[data-channel-id]').dataset.channelId")=='ch'
  fill('777');select('Empty Channel');assert page.locator('[data-channel-id="empty"] .empty').is_visible()
  fill('Example');search.press('Escape');page.locator('#clearFilters').click();assert search.input_value()=='';assert not clear.is_visible()
  assert not errors,errors
  print(f'PASS {width}x{height}: all categories, 8-result limit, overlay hit testing, keyboard, touch={touch}, clear, exact navigation, data preservation')
  context.close()
 browser.close()
