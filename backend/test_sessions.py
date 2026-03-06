import urllib.request, json
r=urllib.request.urlopen("https://api.openf1.org/v1/sessions")
d=json.loads(r.read())
print("Total sessions:", len(d))
if d:
    d.sort(key=lambda x: x.get("date_start", ""))
    print("Latest 5 sessions:")
    for s in d[-5:]:
        print(s.get("session_key"), s.get("year"), s.get("session_name"))
