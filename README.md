# Huddle

Pick where and when the huddle happens: throw pins on a map, mark when you're free, vote on both. The
most-voted place and hour are the plan, one click from everyone's calendar. Rooms are links; no
accounts, no API keys, no dependencies.

```sh
node server.js          # http://127.0.0.1:8765  (HOST=0.0.0.0 to open it to your network)
node build.js --watch   # rebuild index.html from src/ while you edit
```

Deploy behind Traefik: copy `.env.example` to `.env`, set `DOMAIN`, `docker compose up -d --build`.

Development notes for people and agents: [AGENTS.md](AGENTS.md), [docs/map.md](docs/map.md),
[docs/design.md](docs/design.md).
