"use strict";

const SIMPLE_HELP_ROWS = [
  ["/s cake", "Web search"],
  ["/s wiki --query \"Einstein\"", "Search inside a specific website"],
  ["/s cake --images", "Image search grid"],
  ["/s cake --videos", "Video search grid"],
  ["/open <n>", "Open a numbered result or page link"],
  ["/open <col,row>", "Open an image/video grid item"],
  ["/img <n|col,row>", "Open an image in mpv"],
  ["/play <n|url|col,row>", "Play video in mpv"],
  ["/ai --query \"hello\"", "Ask AI using saved keys"],
  ["/aikey show", "Show saved AI key status"],
  ["/history  /searches", "Page and search history"],
  ["/bookmark  /bookmarks", "Save and view bookmarks"],
  ["/next  /prev", "Paginate current search"],
  ["/doctor", "Self-diagnose all subsystems"],
  ["/help", "Full command reference"],
  ["/quit", "Exit"],
];

const FULL_HELP_SECTIONS = [
  {
    title: "Navigation",
    lines: [
      "/home  /reload  /open <n>  /open <col,row>  /next  /prev",
      "/back  /forward              Move through browser history",
      "/history [n]                 Show visited pages or reopen one by number",
    ],
  },
  {
    title: "Search",
    lines: [
      "/s <query>                           Web search",
      "/s <query> --images                  Image search grid",
      "/s <query> --videos                  Video search grid",
      "/s wiki --query \"Albert Einstein\"    Wikipedia API search",
      "/s yt --query \"cake\"                 YouTube search via yt-dlp",
      "/s github --query \"react hooks\"      GitHub repository search",
      "/s so --query \"react hooks\"          Stack Overflow API search",
      "/s npm --query \"react\"               npm registry search",
      "/s <site> --query <text>             Site-scoped search with engine/API fallback",
      "Aliases: wiki, gh, yt, so, mdn, npm, pypi, hn, arxiv, imdb, amazon, medium, linkedin, x, insta, redgifs, phub, xham",
    ],
  },
  {
    title: "AI Chat",
    lines: [
      "/ai --query \"What is DNA?\"        Ask AI using the saved provider keys",
      "/ai set key --\"gemini\" -'KEY'     Add an API key (gemini / openai / claude / meta)",
      "/ai delete key --\"openai\"         Remove all keys for a provider",
      "/aikey show                        Show saved AI key status",
      "Replies render inline as: cipherbrowse> <provider> response",
    ],
  },
  {
    title: "Video / Image",
    lines: [
      "/play <n|url|col,row>       Play video in mpv",
      "/playpage                   Try playback from the current page URL",
      "/img <n|url|col,row>        Open image in mpv",
    ],
  },
  {
    title: "Page Tools",
    lines: [
      "/summarize  /export [md|html|json|all]  /find <text>  /stats  /readmode",
      "/note <text>  /note-delete <n> [m]  /notes  /crawl <url>  /rss <url>  /share",
    ],
  },
  {
    title: "Bookmarks & History",
    lines: [
      "/bookmark                   Save current page",
      "/bookmarks [n]              List bookmarks or open one",
      "/bookmark-remove <n>        Delete a bookmark",
      "/searches [n]               Show search history or re-run one",
      "/history [n]                Show page history or reopen one",
    ],
  },
  {
    title: "Monitoring",
    lines: [
      "/alert <url>  /alerts  /alert-remove <n>",
    ],
  },
  {
    title: "Recon",
    lines: [
      "/whois  /ping  /headers  /robots  /scan  /extract  /trace  /ssl  /myip  /ipinfo",
    ],
  },
  {
    title: "Crypto",
    lines: [
      "/hash  /encode  /decode  /rot13  /hex  /unhex  /passgen [len]",
    ],
  },
  {
    title: "Customisation",
    lines: [
      "/theme [green|amber|blue|cyan|white]  /alias <name>=<command>  /proxy [url|tor|off]",
    ],
  },
  {
    title: "Diagnostics",
    lines: [
      "/doctor  /install-help  /install-global  /sysinfo  /log  /matrix",
    ],
  },
  {
    title: "Misc",
    lines: [
      "/clear  /help  /quit",
    ],
  },
];

const ALL_COMMANDS = [
  "/s",
  "/open",
  "/play",
  "/playpage",
  "/img",
  "/ai",
  "/aikey",
  "/doctor",
  "/install-help",
  "/install-global",
  "/next",
  "/prev",
  "/back",
  "/forward",
  "/home",
  "/reload",
  "/bookmark",
  "/bookmarks",
  "/bookmark-remove",
  "/history",
  "/searches",
  "/summarize",
  "/export",
  "/find",
  "/readmode",
  "/note",
  "/notes",
  "/note-delete",
  "/alert",
  "/alerts",
  "/alert-remove",
  "/whois",
  "/ping",
  "/headers",
  "/robots",
  "/scan",
  "/extract",
  "/trace",
  "/ssl",
  "/myip",
  "/ipinfo",
  "/hash",
  "/encode",
  "/decode",
  "/rot13",
  "/hex",
  "/unhex",
  "/sysinfo",
  "/log",
  "/matrix",
  "/clear",
  "/help",
  "/quit",
  "/exit",
  "/rss",
  "/passgen",
  "/crawl",
  "/share",
  "/theme",
  "/alias",
  "/stats",
  "/proxy",
  "/diff",
];

module.exports = {
  SIMPLE_HELP_ROWS,
  FULL_HELP_SECTIONS,
  ALL_COMMANDS,
};
