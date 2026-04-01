# Scrable Live

A Next.js + React multiplayer Scrabble-style web game that runs in Docker and syncs one shared board across connected phones or browsers.

## What is included

- Room-based multiplayer over Socket.IO
- Shared 15x15 bonus board
- Turn-based play with submit, pass, recall, and tile exchange
- Score tracking and built-in English dictionary validation
- Mobile-friendly UI for players joining from their phones
- Dockerfile and `docker-compose.yml`

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3010`.

## Run with Docker

```bash
docker compose up --build
```

Open `http://localhost:3010`.

## Default rules used

- Standard 15x15 Scrabble-style bonus layout
- English tile values and tile distribution
- 2 to 4 players
- 7-tile racks
- First move must touch the center
- Moves must be contiguous and connect to the existing board
- Word list validation uses the installed English word list package

## Notes

- Room and game state currently live in server memory, so restarting the container resets active rooms.
- This is a Scrabble-style implementation rather than an official licensed clone.
- If you want a custom board setup, house rules, Hebrew tiles, AI opponents, private rooms, or persistent game storage, the current structure is ready for those upgrades.
