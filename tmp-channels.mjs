const cats = [
  "football","basketball","baseball","hockey","tennis","mma","boxing","rugby","cricket","golf",
  "motorsport","cycling","volleyball","nfl","nba","mlb","nhl","f1","ufc","wwe","racing",
  "darts","snooker","afl","handball","tabletennis","badminton","formula1","motor","americanfootball",
  "soccer","ppv","live","tvchannels","iptv","channels24"
];
for (const category of cats) {
  const res = await fetch(`https://api.sportsrc.org/?data=matches&category=${encodeURIComponent(category)}`);
  const json = await res.json();
  const data = Array.isArray(json.data) ? json.data : [];
  if (!data.length) continue;
  const always = data.filter((m) => !m.date || m.date <= 0);
  console.log(`\n${category} total=${data.length} channels=${always.length}`);
  for (const m of data) {
    const kind = !m.date || m.date <= 0 ? "CH" : "MATCH";
    console.log(`  ${kind} ${m.title}`);
  }
}
