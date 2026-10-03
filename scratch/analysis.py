import json, urllib.request, time, sys
def post(path, body):
    t=time.time()
    req=urllib.request.Request("http://localhost:3001"+path, data=json.dumps(body).encode(), headers={'Content-Type':'application/json'})
    try:
        d=json.load(urllib.request.urlopen(req,timeout=240))
    except urllib.error.HTTPError as e:
        d=json.load(e)
    return d, time.time()-t
ids = sys.argv[1:] or ['hybas-4071007920','hybas-1071235850']
for i in ids:
    print("=====",i)
    d,t=post('/api/analysis/fingerprint',{'id':i})
    print("fingerprint %.1fs"%t, d.get('status'), d.get('error'))
    for k,m in (d.get('metrics') or {}).items():
        print("  ",k,{kk:vv for kk,vv in m.items() if kk in('value','status','window','scaleM','imageCount','top','segments','reason')})
    d,t=post('/api/analysis/timeline',{'id':i})
    obs=d.get('observations',[])
    print("timeline %.1fs"%t, d.get('status'), d.get('error'), len(obs), 'with-indices', d.get('indicesComputedFor'), d.get('indicesError'))
    for o in obs[-3:]: print("  ",o)
    d,t=post('/api/analysis/attention',{'id':i})
    print("attention %.1fs"%t, d.get('status'), d.get('error'), d.get('message'))
    print("  ",d.get('comparisons'))
    for it in d.get('items',[]): print("  ",it['type'],it['reason'])
