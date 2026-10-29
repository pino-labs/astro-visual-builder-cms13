#!/usr/bin/env bash
set -u
BASE=${BASE:-http://127.0.0.1:4321}; GRAPH=${GRAPH:-http://127.0.0.1:4100}; KEY=${KEY:-callback-secret-123}
ARTICLE=${ARTICLE:-/blog/hello/}; DOC=${DOC:-karticle_en_Published}
TOKEN=${TOKEN:-good-token}; PREVIEW_QS=${PREVIEW_QS:-key=karticle&ver=2&loc=en}
CMS_ORIGIN=${CMS_ORIGIN:-https://cms.example.test}; DRAFT_TEXT=${DRAFT_TEXT:-DRAFT heading}; SKIP=${SKIP:-}
PREVIEW="$BASE/preview?$PREVIEW_QS&ctx=edit"
pass=0; fail=0
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
ok()   { echo "PASS  $1"; pass=$((pass+1)); }
bad()  { echo "FAIL  $1  -> $2"; fail=$((fail+1)); }
skip() { [[ " $SKIP " == *" $1 "* ]] && echo "SKIP  section $1"; }
hdr()  { curl -s -D - -o /dev/null "$@" | tr -d '\r'; }
get()  { curl -s "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
hook() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/hooks/graph" -H 'Content-Type: text/plain' "$@"; }
purge(){ get -X POST "$BASE/hooks/graph" -H "x-api-key: $KEY" -H 'Content-Type: text/plain' --data "{\"data\":{\"docId\":\"$DOC\"}}"; }

[ "$(code "$BASE/")" = 200 ] || { echo "Site not reachable at $BASE (start it first; see README)"; exit 2; }

if ! skip 1; then echo "== 1. JavaScript and media per page"
REACT_CHUNK=$(grep -l hydrateRoot dist/client/_astro/*.js 2>/dev/null | xargs -n1 basename 2>/dev/null | head -1)
art=$(get "$BASE$ARTICLE"); a=$(echo "$art" | grep -c '<script')
echo "$art" | grep -q '<h1' && [ "$a" -eq 0 ] && ok "1a article page renders and ships no <script>" || bad "1a article page" "scripts=$a"
l=$(get "$BASE/")
islands=$(echo "$l" | grep -o '<astro-island' | wc -l)
[ "$islands" -eq 1 ] && ! echo "$l" | grep -q "${REACT_CHUNK:-no-react-chunk}" && ok "1b landing page: 1 island, React client never referenced" || bad "1b landing islands" "$islands islands"
files=$(for u in $(echo "$l" | grep -oE '(component|renderer)-url="[^"]+"' | cut -d'"' -f2); do
  echo "dist/client$u"; grep -oE '"\./[^"]+\.js"' "dist/client$u" | tr -d '"' | sed 's#^\./#dist/client/_astro/#'
done | sort -u)
js=0; for f in $files; do js=$((js + $(gzip -c "$f" | wc -c))); done
inline=$(echo "$l" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const z=require("node:zlib");let n=0;for(const m of s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))n+=z.gzipSync(Buffer.from(m[1]),{level:9}).length;console.log(n)})')
[ "$js" -gt 0 ] && [ "$js" -le 20480 ] && ok "1c landing page JavaScript: $js B gzip in chunks (+ $inline B inline) ≤ 20 KiB" || bad "1c landing JavaScript" "$js B gzip"
imgs=$(printf '%s
%s
' "$art" "$l" | grep -oE '<img [^>]*src="[^"]+"' | grep -oE 'src="[^"]+"' | cut -d'"' -f2)
n=$(echo "$imgs" | grep -c .); off=$(echo "$imgs" | grep -vc "^$CMS_ORIGIN/")
[ "$n" -gt 0 ] && [ "$off" -eq 0 ] && ok "1d $n images on the article and landing load from the CMS origin" || bad "1d image origin" "$off of $n not from $CMS_ORIGIN"

fi

if ! skip 2; then echo "== 2. CDN-cacheable at the origin, revalidated by browsers"
purge >/dev/null
h1=$(hdr "$BASE$ARTICLE"); sleep 1; h2=$(hdr "$BASE$ARTICLE"); h3=$(hdr "$BASE$ARTICLE?utm_source=x&bust=$RANDOM")
echo "$h1" | grep -qi 'x-astro-cache: MISS' && echo "$h2" | grep -qi 'x-astro-cache: HIT' && ok "2a MISS, then HIT" || bad "2a MISS/HIT" "$(echo "$h1$h2" | grep -i x-astro)"
echo "$h1" | grep -qi 'cache-control: public, max-age=0, s-maxage=600, stale-while-revalidate=1800' && ok "2b MISS: max-age=0, s-maxage=600, swr=1800" || bad "2b Cache-Control" "$(echo "$h1" | grep -i cache-control)"
s2=$(echo "$h2" | grep -i '^cache-control' | grep -oE 's-maxage=[0-9]+' | cut -d= -f2); age=$(echo "$h2" | grep -i '^age:' | awk '{print $2}')
[ -n "$s2" ] && [ -n "$age" ] && [ "$((s2 + age))" -eq 600 ] && ok "2c HIT: s-maxage=$s2 + Age=$age = 600 (CDN never holds it longer than the origin)" || bad "2c HIT freshness" "s-maxage=$s2 age=$age"
echo "$h3" | grep -qi 'x-astro-cache: HIT' && ok "2d query string served from the same entry (no cache-busting)" || bad "2d query string" "$(echo "$h3" | grep -i x-astro)"
echo "$h1$h2" | grep -qi '^cdn-cache-control' && bad "2e CDN-Cache-Control leaked" "present" || ok "2e internal CDN-Cache-Control never leaves the origin"
hh=$(curl -s -I "$BASE$ARTICLE" | tr -d '\r')
echo "$hh" | grep -qi 'x-astro-cache: HIT' && ok "2f HEAD answered from the stored entry" || bad "2f HEAD" "$(echo "$hh" | grep -i x-astro)"

fi

if ! skip 3; then echo "== 3. Preview: never cached, never public"
hb=$(hdr "$PREVIEW&preview_token=bad")
echo "$hb" | grep -q ' 401' && echo "$hb" | grep -qi 'private, no-store' && ! echo "$hb" | grep -qi x-astro-cache && ok "3a bad token: 401, private no-store, no X-Astro-Cache" || bad "3a bad token" "$(echo "$hb" | head -4)"
hg=$(hdr "$PREVIEW&preview_token=$TOKEN"); bg=$(get "$PREVIEW&preview_token=$TOKEN")
echo "$hg" | grep -q ' 200' && echo "$bg" | grep -qF "$DRAFT_TEXT" && ok "3b good token renders the draft" || bad "3b good token" "$(echo "$hg" | head -2)"
! echo "$hg" | grep -qi x-astro-cache && echo "$hg" | grep -qi 'private, no-store' && ok "3c draft: private, no-store, no X-Astro-Cache" || bad "3c draft caching" "$(echo "$hg" | grep -iE 'x-astro|cache-control')"
echo "$hg" | grep -qi "content-security-policy: frame-ancestors $CMS_ORIGIN" && echo "$hg" | grep -qi 'x-robots-tag: noindex' && ok "3d CSP frame-ancestors = CMS origin, noindex" || bad "3d headers" "$(echo "$hg" | grep -iE 'content-security|robots')"
echo "$bg" | grep -q 'data-epi-property-name\|data-epi-edit' && ok "3e edit context draws property overlays" || bad "3e overlays" "no data-epi-* attributes"
echo "$bg" | grep -q 'communicationinjector.js' && echo "$bg" | grep -q 'optimizely:cms:contentSaved' && ! echo "$bg" | grep -q "${REACT_CHUNK:-no-react-chunk}" && ok "3f injector + contentSaved listener, no React on the client" || bad "3f preview scripts" "missing injector/listener or React referenced"
get "$BASE$ARTICLE" | grep -qF "$DRAFT_TEXT" && bad "3g draft leaked to the public page" "DRAFT on $ARTICLE" || ok "3g public page shows no draft"

fi

if ! skip 4; then echo "== 4. Webhook accepts only Graph"
c=$(hook --data '{}'); c2=$(hook -H 'x-api-key: wrong-key-wrong-key' --data '{}'); c3=$(hook -H "x-api-key: $KEY" --data '{}'); c4=$(hook -H "x-api-key: $KEY" --data 'not json')
[ "$c$c2$c3$c4" = "401401400400" ] && ok "4a no key 401, wrong key 401, no docId 400, not JSON 400" || bad "4a webhook auth" "$c $c2 $c3 $c4"
c5=$(hook -H "x-api-key: $KEY" --data '{"data":{"docId":"karticle_en_Draft"}}'); c6=$(hook -H "x-api-key: $KEY" --data '{"data":{"docId":"00000000-0000-0000-0000-000000000000_en_Published"}}')
[ "$c5$c6" = "202202" ] && ok "4b draft event 202, content without a URL 202 (nothing to purge)" || bad "4b non-page events" "$c5 $c6"
c7=$(hook -H "x-api-key: $KEY" -H 'Origin: https://attacker.example' --data '{}')
[ "$c7" = "403" ] && ok "4d a cross-site form POST is refused by Astro's CSRF check (403); Graph sends no Origin" || bad "4d CSRF check" "$c7"
hw=$(hdr -X POST "$BASE/hooks/graph" -H "x-api-key: $KEY" -H 'Content-Type: text/plain' --data '{}')
echo "$hw" | grep -qi 'x-astro-cache\|s-maxage' && bad "4c webhook response carries cache headers" "$(echo "$hw" | grep -i cache)" || ok "4c webhook response is never cached"

fi

if ! skip 5; then echo "== 5. No preview data leaks into public HTML under concurrency"
purge >/dev/null
for i in $(seq 1 12); do get "$BASE/preview?$PREVIEW_QS&ctx=preview&preview_token=$TOKEN" >/dev/null & get "$BASE$ARTICLE" > "$TMP/leak.$i" & done; wait
leaks=$(cat "$TMP"/leak.* | grep -c 'preview_token')
[ "$leaks" -eq 0 ] && ok "5a 12 concurrent preview + public renders (first one a MISS): no preview_token in public HTML" || bad "5a token leak" "$leaks"
gp=$(get "$BASE/preview?$PREVIEW_QS&ctx=preview&preview_token=$TOKEN" | grep -oE '(src|href)="[^"]*preview_token=[^"]*"' | head -1)
echo "$gp" | grep -qF "preview_token=$TOKEN" && ok "5b preview HTML: rich-text image carries the token (so 5a is meaningful)" || bad "5b preview image token" "$gp"
purge >/dev/null
for i in $(seq 1 12); do get "$BASE/preview?$PREVIEW_QS&ctx=edit&preview_token=$TOKEN" >/dev/null & get "$BASE$ARTICLE" > "$TMP/edit.$i" & done; wait
epi=$(cat "$TMP"/edit.* | grep -c 'data-epi-')
ep=$(get "$BASE/preview?$PREVIEW_QS&ctx=edit&preview_token=$TOKEN" | grep -c 'data-epi-')
[ "$epi" -eq 0 ] && [ "$ep" -gt 0 ] && ok "5c 12 concurrent edit-mode preview + public renders: no data-epi-* in public HTML (the edit preview has them)" || bad "5c edit-mode leak" "public=$epi preview=$ep"

fi

if ! skip 6; then echo "== 6. Content pages answer GET and HEAD only"
hp=$(hdr -X POST "$BASE/" -H 'Content-Type: application/json' --data '{}')
echo "$hp" | grep -q ' 405' && ! echo "$hp" | grep -qi 'x-astro-cache\|s-maxage' && ok "6a POST / -> 405, no cache headers" || bad "6a POST /" "$(echo "$hp" | head -3)"
hn=$(hdr "$BASE/no-such-page-$RANDOM/")
echo "$hn" | grep -q ' 404' && ! echo "$hn" | grep -qi 's-maxage\|x-astro-cache' && ok "6b unknown path -> 404 without CDN cache headers" || bad "6b 404" "$(echo "$hn" | grep -iE 'HTTP|cache')"

fi

if ! skip 7; then echo "== 7. A publish reaches the next request"
get "$BASE$ARTICLE" >/dev/null
curl -s "$GRAPH/__set?heading=Published%20heading%20v2" >/dev/null
before=$(get "$BASE$ARTICLE" | grep -o 'Published heading v[0-9]')
t0=$(date +%s%3N); wb=$(purge); ha=$(hdr "$BASE$ARTICLE"); t1=$(date +%s%3N)
after=$(get "$BASE$ARTICLE" | grep -o 'Published heading v[0-9]')
[ "$before" = "Published heading v1" ] && [ "$after" = "Published heading v2" ] && echo "$wb" | grep -q "\"path\":\"$ARTICLE\"" && echo "$ha" | grep -qi 'x-astro-cache: MISS' \
  && ok "7 cached v1 -> webhook -> MISS -> v2, webhook + fresh render in $((t1-t0)) ms" || bad "7 publish" "before=$before after=$after webhook=$wb"
curl -s "$GRAPH/__set?heading=Published%20heading%20v1" >/dev/null; purge >/dev/null

fi

if ! skip 8; then echo "== 8. No secrets in the client bundle"
grep -rqF -e 'test-single-key' -e 'callback-secret-123' dist/client && bad "8 secret value in dist/client" "found" || ok "8 neither key's value appears in dist/client"

fi

echo "-----"; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
