echo "== search Congo River"; curl -s "localhost:3001/api/geocode/search?q=Congo%20River" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(d.get('ok'), d.get('error'))
for r in d['results'][:6]: print(' ',r['type'],r['name'],'|',r.get('country'),r['center'],r.get('bbox'))"
echo "== search Congo Basin"; curl -s "localhost:3001/api/geocode/search?q=Congo%20Basin" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(d.get('ok'), d.get('error'))
for r in d['results'][:6]: print(' ',r['type'],r['name'],'|',r.get('country'),r['center'],r.get('via'))"
echo "== list saved"; curl -s "localhost:3001/api/watersheds" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for r in d['watersheds']: print(' ',r['id'],r['name'],r['level'],round(r['areaKm2']),r['center'])"
