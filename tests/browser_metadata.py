"""Browser integration: python3 tests/browser_metadata.py (server on port 8000)."""
import json
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

BASE='http://127.0.0.1:8000'
KEY='comcast-collection-v1'
initial={
 'channels':[{'id':'channel','num':'42','name':'My Channel'}],
 'items':[{'id':'existing','type':'movie','title':'Existing Movie','owned':True,'ripped':True,'added':False},
          {'id':'box','type':'movie','title':'My Box Set','owned':True},
          {'id':'show','type':'show','title':'Existing Show','channel':'channel','owned':True}],
 'collectionChildren':[{'id':'oldchild','parentId':'box','title':'Existing Child','owned':True,'ripped':False,'added':True},
                       {'id':'season','parentId':'show','title':'Existing Show Season 1','owned':True}],
 'movieDetails':{'existing':{'description':'My manual description','manualFields':['description']}},
 'showDetails':{'show':{'description':'My TV description','episodes':{'season':[{'id':'episode','title':'Custom episode','customTitle':True,'owned':True,'ripped':True,'added':False}]}}},
 'unknownCustomField':{'keep':'all data'}
}
registry={name:100+i for i,name in enumerate(['Existing Movie','Existing Show','Existing Child','New Movie','New Show','New Child','Index Child'])}
requests=[]
def worker(route):
 u=urlparse(route.request.url);args=parse_qs(u.query);requests.append(u.path+'?'+u.query)
 if u.path.endswith('/search'):
  name=args.get('query',args.get('title',['']))[0]
  body={'results':[{'id':registry[name],'title':name,'year':'2020'}]} if name in registry else {'results':[]}
 elif u.path.endswith('/details'):
  id=int(args['id'][0]);name=next(name for name,value in registry.items() if value==id)
  body={'id':id,'title':name,'year':'2020','firstAirDate':'2020-01-01','overview':'Service description for '+name,'genres':['Drama','Adventure'],'runtime':100,'poster':'https://image.tmdb.org/t/p/w500/fixture.jpg','seasons':[{'number':1}]}
 else: raise AssertionError('Unexpected route '+u.path)
 route.fulfill(status=200,json=body,headers={'Access-Control-Allow-Origin':'*'})

def saved(page): return page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'"))')
def wait_metadata(page,title):
 page.wait_for_function('''title=>{const d=JSON.parse(localStorage.getItem('comcast-collection-v1'));const x=[...d.items,...d.collectionChildren].find(x=>x.title===title);return x&&(d.movieDetails?.[x.id]||d.showDetails?.[x.id])?.metadataLookup?.status==='ok'}''',arg=title)
 print('PASS metadata:',title)

def prompt_once(page,text): page.once('dialog',lambda dialog:dialog.accept(text))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context()
 context.add_init_script('''if(!localStorage.getItem('''+json.dumps(KEY)+''')){localStorage.setItem('''+json.dumps(KEY)+','+json.dumps(json.dumps(initial))+''');localStorage.setItem('comcast-posters-v1',JSON.stringify({existing:'https://example.org/existing.jpg'}))}''')
 context.route('https://posters.thomasboydspam.workers.dev/**',worker)
 context.route('https://image.tmdb.org/**',lambda route:route.abort())
 context.route('https://example.org/**',lambda route:route.abort())
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE)
 for title in ['Existing Movie','Existing Show','Existing Child']:wait_metadata(page,title)
 page.locator('#movieTab').click();prompt_once(page,'New Movie (2020)');page.get_by_role('button',name='+ Add Movie / Collection',exact=True).click();wait_metadata(page,'New Movie (2020)')
 page.locator('#guideTab').click();page.locator('.cardhead').first.click();prompt_once(page,'New Show');page.get_by_role('button',name='+ Add Show',exact=True).click();wait_metadata(page,'New Show')
 assert next(x for x in saved(page)['items'] if x['title']=='New Show')['channel']=='channel'
 # Add a child from the guide's collection expander.
 page.locator('#movieTab').click();page.get_by_role('button',name='▶ My Box Set',exact=True).click()
 prompt_once(page,'Index Child');page.get_by_role('button',name='+ Add Movie',exact=True).click();wait_metadata(page,'Index Child')
 page.goto(BASE+'/movie.html?id=box');prompt_once(page,'New Child');page.locator('#addMovie').click();wait_metadata(page,'New Child')
 child=next(x for x in saved(page)['collectionChildren'] if x['title']=='New Child')
 page.goto(BASE+'/movie.html?id='+str(child['id'])+'&parent=box')
 assert page.locator('#description').inner_text()=='Service description for New Child'
 assert '100 minutes' in page.locator('#meta').inner_text()
 page.locator('#editInfo').click();page.locator('#descriptionInput').fill('User custom text');page.locator('#saveInfo').click()
 page.locator('#loadInfo').click();page.wait_for_function("document.querySelector('#status').textContent.startsWith('Metadata saved')")
 page.reload();assert page.locator('#description').inner_text()=='User custom text'
 print('PASS child details, manual edits, repair and reload')
 page.goto(BASE+'/show.html?id=show');assert page.locator('#description').inner_text()=='My TV description'
 page.locator('#editDescription').click();page.locator('#descriptionInput').fill('');page.locator('#saveDescription').click();page.locator('#loadMetadata').click()
 page.wait_for_function("document.querySelector('#status').textContent.startsWith('Metadata saved')")
 page.reload();assert page.locator('#description').inner_text()==''
 assert saved(page)['showDetails']['show']['episodes']['season'][0]['title']=='Custom episode'
 print('PASS TV manual blank description and existing episodes')
 page.goto(BASE);page.locator('#scanPosters').click();page.wait_for_function("!document.querySelector('#scanPosters').disabled")
 data=saved(page);assert data['unknownCustomField']=={'keep':'all data'};assert data['channels']==initial['channels']
 assert next(x for x in data['items'] if x['id']=='existing')==initial['items'][0]
 assert next(x for x in data['collectionChildren'] if x['id']=='oldchild')==initial['collectionChildren'][0]
 assert data['movieDetails']['existing']['description']=='My manual description'
 assert page.evaluate("JSON.parse(localStorage.getItem('comcast-posters-v1')).existing")=='https://example.org/existing.jpg'
 page.locator('#dashboardTab').click();assert 'New Movie (2020)' in page.locator('#dashboardDetails').inner_text();assert 'New Child' in page.locator('#dashboardDetails').inner_text()
 page.get_by_role('button',name='Show Owned,',exact=False).click();assert 'Existing Movie' in page.locator('#dashboardDetails').inner_text()
 print('PASS Repair All, dashboard, channels, tracking, existing posters, unknown data')
 assert not errors,errors
 print('PASS: browser integration; no uncaught JavaScript errors;',len(requests),'Worker requests')
 browser.close()
