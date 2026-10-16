# Huddle

Pick where and when the huddle happens: throw pins on a map, mark when you're free, vote on both. The
most-voted place and hour are the plan, one click from everyone's calendar. Rooms are links; no
accounts, no API keys. The server has no dependencies; building the page needs Stylus, from npm.

```sh
npm install             # once: the build's dependencies
npm start               # build, then serve on http://127.0.0.1:8765  (HOST=0.0.0.0 to open it to your network)
npm run watch           # rebuild index.html from src/ while you edit
```

Deploy behind Traefik: copy `.env.example` to `.env`, set `DOMAIN`, `docker compose up -d --build`.
On GitHub, every push to `main` (and every `v*` tag) also publishes the image to
`ghcr.io/<owner>/<repo>`.

Development notes for people and agents: [AGENTS.md](AGENTS.md), [docs/map.md](docs/map.md),
[docs/design.md](docs/design.md).

MIT licensed: see [LICENSE](LICENSE).
