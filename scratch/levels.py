import json, urllib.request, sys
for lat,lon in [(21.53,83.87),(18.0,79.55),(21.83,73.75)]:
    d=json.load(urllib.request.urlopen(f"http://localhost:3001/api/watersheds/resolve?lat={lat}&lon={lon}",timeout=90))
    print("==",lat,lon,d.get('location',{}).get('countries'))
    for c in d['candidates']:
        print("  L%d %s %d km2 pfaf %s"%(c['level'],c['id'],c['areaKm2'],c['metadata'].get('PFAF_ID')))
