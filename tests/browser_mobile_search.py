"""Keyboard-space simulation in mobile Chromium. Server: localhost:8000."""
import json
from playwright.sync_api import sync_playwright
DATA={'channels':[],'items':[{'id':str(i),'type':'movie','title':f'Example Movie {i}'} for i in range(12)],'collectionChildren':[],'movieDetails':{},'showDetails':{}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(820,1180)]:
  for visual in [True,False]:
   context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
   context.add_init_script("localStorage.setItem('comcast-collection-v1',"+json.dumps(json.dumps(DATA))+")")
   if not visual:context.add_init_script("Object.defineProperty(window,'visualViewport',{value:null,configurable:true})")
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://127.0.0.1:8000',wait_until='domcontentloaded');page.evaluate('metadata.stop()')
   search=page.locator('#search');search.fill('Example')
   before=page.evaluate("localStorage.getItem('comcast-collection-v1')")
   titles=page.locator('#searchSuggestions .search-title').all_text_contents()
   if visual:
    # Simulate iOS keyboard geometry without claiming an actual OS keyboard.
    page.evaluate('''()=>{window.keyboardBottom=430;window.viewportOffset=0;
     Object.defineProperty(visualViewport,'height',{get:()=>keyboardBottom-viewportOffset,configurable:true});
     Object.defineProperty(visualViewport,'offsetTop',{get:()=>viewportOffset,configurable:true});
     visualViewport.dispatchEvent(new Event('resize'))}''')
   else:
    page.set_viewport_size({'width':width,'height':430})
   page.wait_for_function("document.querySelector('#searchSuggestions').getBoundingClientRect().bottom<=423")
   assert page.evaluate("[...document.querySelectorAll('#searchSuggestions [role=option]')].every(e=>e.getBoundingClientRect().height>=44)")
   assert page.evaluate("document.querySelector('#searchSuggestions').scrollHeight>document.querySelector('#searchSuggestions').clientHeight")
   y=page.evaluate('scrollY')
   # Keyboard scrolling reaches the final option while never moving the page.
   for _ in range(8):search.press('ArrowDown')
   assert page.evaluate('''()=>{const l=document.querySelector('#searchSuggestions'),r=l.getBoundingClientRect(),last=l.lastElementChild.getBoundingClientRect();return l.scrollTop>0&&last.bottom<=r.bottom&&last.top>=r.top}''')
   assert page.evaluate('scrollY')==y
   # Real Chromium touch gestures scroll the dropdown, including its boundaries.
   session=context.new_cdp_session(page)
   rect=page.locator('#searchSuggestions').bounding_box();x=rect['x']+rect['width']/2
   def swipe(start,end):
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':start}]})
    for i in range(1,9):session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':start+(end-start)*i/8}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   page.locator('#searchSuggestions').evaluate('(l)=>l.scrollTop=0')
   swipe(rect['y']+rect['height']-12,rect['y']+12)
   page.wait_for_function("document.querySelector('#searchSuggestions').scrollTop>0")
   assert page.evaluate('scrollY')==y
   page.locator('#searchSuggestions').evaluate('(l)=>l.scrollTop=0')
   swipe(rect['y']+12,rect['y']+rect['height']-12)
   assert page.evaluate('scrollY')==y
   # Done blurs the input but preserves the same matches and query.
   page.get_by_role('button',name='Done searching, dismiss keyboard').tap()
   assert page.evaluate("document.activeElement!==document.querySelector('#search')")
   assert search.input_value()=='Example'
   assert page.locator('#searchSuggestions').is_visible()
   assert page.locator('#searchSuggestions .search-title').all_text_contents()==titles
   if visual:
    page.evaluate("keyboardBottom=370;viewportOffset=40;visualViewport.dispatchEvent(new Event('scroll'))")
    assert page.locator('#searchSuggestions').bounding_box()['y']+page.locator('#searchSuggestions').bounding_box()['height']<=362
    page.evaluate("keyboardBottom=innerHeight;viewportOffset=0;visualViewport.dispatchEvent(new Event('resize'))")
   else:page.set_viewport_size({'width':width,'height':height})
   assert page.locator('#searchSuggestions').is_visible()
   assert page.evaluate("localStorage.getItem('comcast-collection-v1')")==before
   page.get_by_role('button',name='Clear search',exact=True).tap()
   assert search.input_value()=='';assert not page.locator('#searchSuggestions').is_visible()
   assert not errors,errors
   print(f'PASS {width}x{height} visualViewport={visual}: compact 44px rows, keyboard-space bounds, list-only keyboard/touch scrolling, Done, clear, unchanged data')
   context.close()
 browser.close()
