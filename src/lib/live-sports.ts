/**
 * Curated live sports channels for TTFlix Android app.
 * The RUSH channel (DirecTV 650) is the primary sports destination
 * for T&T viewers — FIFA, NBA, NFL all air here.
 *
 * Stream sources use streamtp.com embeds which work inside Capacitor WebView.
 * If a stream fails, the player shows a friendly fallback with a retry button.
 */

export type LiveChannel = {
  id: string;
  name: string;
  /** Short description shown on the card */
  description: string;
  /** Emoji fallback icon — always renders, no network needed */
  emoji: string;
  /** Remote logo URL — shown if it loads, falls back to emoji */
  logo: string;
  /** Embed src loaded inside the full-screen player */
  streamUrl: string;
  /** Card gradient accent colour */
  color: string;
  /** Sport tags shown as pills on the card */
  tags: string[];
};

// Primary embed source — carries DirecTV, ESPN, beIN, Sky etc.
function streamtp(slug: string) {
  return `https://streamtp.com/global1.php?stream=${slug}`;
}

export const LIVE_SPORTS_CHANNELS: LiveChannel[] = [
  {
    id: "rush",
    name: "RUSH",
    description: "DirecTV Ch. 650 · FIFA · NBA · NFL · MLB",
    emoji: "⚽",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/c/cc/DirecTV_logo_2016.svg/320px-DirecTV_logo_2016.svg.png",
    streamUrl: streamtp("directv650"),
    color: "#003087",
    tags: ["FIFA", "NBA", "NFL", "MLB"],
  },
  {
    id: "espn",
    name: "ESPN",
    description: "Live games, scores & analysis 24/7",
    emoji: "🏈",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/320px-ESPN_wordmark.svg.png",
    streamUrl: streamtp("espn1"),
    color: "#CC0000",
    tags: ["NBA", "NFL", "MLB", "UFC"],
  },
  {
    id: "espn2",
    name: "ESPN 2",
    description: "More live sport from ESPN",
    emoji: "🏀",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/320px-ESPN_wordmark.svg.png",
    streamUrl: streamtp("espn2"),
    color: "#b30000",
    tags: ["NFL", "College", "Tennis"],
  },
  {
    id: "bein1",
    name: "beIN Sports",
    description: "UEFA Champions League · LaLiga · Premier League",
    emoji: "🏆",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/BeIN_Sports_logo.svg/320px-BeIN_Sports_logo.svg.png",
    streamUrl: streamtp("bein1"),
    color: "#8B0000",
    tags: ["FIFA", "UEFA", "LaLiga"],
  },
  {
    id: "bein2",
    name: "beIN Sports 2",
    description: "Serie A · Bundesliga · International football",
    emoji: "⚽",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/BeIN_Sports_logo.svg/320px-BeIN_Sports_logo.svg.png",
    streamUrl: streamtp("bein2"),
    color: "#6b0000",
    tags: ["Serie A", "Bundesliga"],
  },
  {
    id: "fox-sports",
    name: "Fox Sports 1",
    description: "NFL · UFC · NASCAR · College football",
    emoji: "🥊",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/FOX_Sports_logo.svg/320px-FOX_Sports_logo.svg.png",
    streamUrl: streamtp("foxsports1"),
    color: "#003580",
    tags: ["NFL", "UFC", "NASCAR"],
  },
  {
    id: "nba-tv",
    name: "NBA TV",
    description: "Live NBA games & classic matches",
    emoji: "🏀",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/220px-National_Basketball_Association_logo.svg.png",
    streamUrl: streamtp("nbatv"),
    color: "#1D428A",
    tags: ["NBA", "Basketball"],
  },
  {
    id: "sky-sports",
    name: "Sky Sports",
    description: "Premier League · EFL · International football",
    emoji: "🎯",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e6/Sky_Sports_logo_2020.svg/240px-Sky_Sports_logo_2020.svg.png",
    streamUrl: streamtp("skysports"),
    color: "#005C8A",
    tags: ["Premier League", "EFL"],
  },
];
