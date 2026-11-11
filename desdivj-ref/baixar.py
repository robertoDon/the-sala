import json, os, sys, urllib.request, datetime
IDS = """2120464164854608106 2120101642981040548 2119738295039250507 2119377174713229695
2119009387402686720 2118651671635226726 2118290722889908705 2117922523082076329
2117625659233366404 2117204237868466336 2116841771401658791 2116495175019340153
2116132632966860847 2115772554199867776 2115405718295871654 2115133930022261180
2114677580314165339 2114305692547043677 2113946042052096501 2113577479655080229
2113243953197977970 2112879516716802427 2112487027581329602 2112162573525344583
2112126093780209719 2111766039788974453 2111763654400245830 2111407894587699490
2111407045819912314 2110968285311418706 2110598302706319448 2110241934082220211
2109911910053519465 2109608496601948591 2109189797298495569 2108886680359035068
2108466241556164667 2108137243147985389 2108057388276445648 2107709341331824908
2008083727038206159 2008083599803941126""".split()
base = sys.argv[1]
os.makedirs(f"{base}/midia", exist_ok=True); os.makedirs(f"{base}/json", exist_ok=True)
H = {"User-Agent": "Mozilla/5.0"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60).read()
idx = []
for i in IDS:
    try:
        d = json.loads(get(f"https://cdn.syndication.twimg.com/tweet-result?id={i}&token=a&lang=en"))
    except Exception as e:
        print(i, "ERRO", e); continue
    json.dump(d, open(f"{base}/json/{i}.json", "w"), ensure_ascii=False, indent=1)
    data = datetime.datetime.strptime(d["created_at"][:10], "%Y-%m-%d").strftime("%Y-%m-%d") if "created_at" in d else "sem-data"
    arqs = []
    for n, m in enumerate(d.get("mediaDetails", []), 1):
        if m.get("type") in ("video", "animated_gif"):
            vs = [v for v in m.get("video_info", {}).get("variants", []) if v.get("content_type") == "video/mp4"]
            v = max(vs, key=lambda v: v.get("bitrate", 0))
            nome = f"{data}_{i}_{n}.mp4"; url = v["url"]
        else:
            nome = f"{data}_{i}_{n}.jpg"; url = m["media_url_https"] + "?name=large"
        open(f"{base}/midia/{nome}", "wb").write(get(url)); arqs.append(nome)
    idx.append({"id": i, "data": data, "texto": d.get("text", ""), "arquivos": arqs})
    print(i, data, len(arqs), d.get("text", "")[:90].replace("\n", " "))
json.dump(idx, open(f"{base}/indice.json", "w"), ensure_ascii=False, indent=1)
