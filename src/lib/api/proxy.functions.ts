import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Scripts known to run timer-based popups in Videasy
const AD_PATTERNS = [
  /popunder/i, /pop\.js/i, /adnxs/i, /googlesyndication/i,
  /exoclick/i, /propellerads/i, /popcash/i, /adsterra/i,
  /trafficjunky/i, /juicyads/i, /hilltopads/i, /mgid/i,
  /taboola/i, /outbrain/i, /revcontent/i,
  /setInterval.*open/i, /setTimeout.*open/i,
  /window\.open/i,
];

const BLOCKER = `<script>
(function(){
  // Hard-freeze window.open so timer-based ad scripts can't call it
  var noop = function(){ return {focus:function(){},blur:function(){}}; };
  try { Object.defineProperty(window,'open',{value:noop,writable:false,configurable:false}); }
  catch(e){ window.open = noop; }

  // Override setInterval/setTimeout to prevent ad timer callbacks
  var _si = window.setInterval;
  var _st = window.setTimeout;
  window.setInterval = function(fn, ms) {
    var src = (typeof fn === 'function') ? fn.toString() : String(fn);
    if (/open|popup|redirect|advert/i.test(src)) return 0;
    return _si.apply(this, arguments);
  };
  window.setTimeout = function(fn, ms) {
    var src = (typeof fn === 'function') ? fn.toString() : String(fn);
    if (/open|popup|redirect|advert/i.test(src)) return 0;
    return _st.apply(this, arguments);
  };

  // Block external link navigation
  document.addEventListener('click', function(e){
    var el = e.target;
    for(var i=0;i<10;i++){
      if(!el) break;
      if(el.tagName==='A'){
        var h = el.getAttribute('href')||'';
        if(h && h.indexOf('javascript')===-1 && h!=='#' &&
           h.indexOf(location.hostname)===-1 &&
           (h.indexOf('http')===0||h.indexOf('//')===0)){
          e.preventDefault(); e.stopImmediatePropagation(); return;
        }
        break;
      }
      el = el.parentElement;
    }
  }, true);
})();
</script>`;

export const getProxiedEmbed = createServerFn({ method: "GET" })
  .validator(z.object({
    mediaType: z.enum(["movie", "tv"]),
    tmdbId: z.number(),
    season: z.number().optional(),
    episode: z.number().optional(),
  }))
  .handler(async ({ data }) => {
    const { mediaType, tmdbId, season = 1, episode = 1 } = data;
    const color = "E50914";
    const url = mediaType === "tv"
      ? `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}?color=${color}&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true`
      : `https://player.videasy.net/movie/${tmdbId}?color=${color}&overlay=true`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://player.videasy.net/",
      },
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);

    let html = await res.text();

    // Strip ad scripts by pattern
    html = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (m, c) =>
      AD_PATTERNS.some(p => p.test(m) || p.test(c)) ? "<!-- removed -->" : m
    );
    html = html.replace(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi, (m, src) =>
      AD_PATTERNS.some(p => p.test(src)) ? "<!-- removed -->" : m
    );

    // Add base + inject blocker as first thing in head
    html = html
      .replace(/<head>/i, `<head><base href="https://player.videasy.net/">${BLOCKER}`)
      .replace(/<\/head>/i, `<style>
        [class*="ad"],[id*="ad"],[class*="popup"],[id*="popup"],
        div[style*="position:fixed"],div[style*="position: fixed"]{
          display:none!important;pointer-events:none!important;
        }
      </style></head>`);

    return { html };
  });
