# RomM API notes

RomM is a FastAPI app, so every server publishes its own schema:

- `https://<romm>/api/docs` — Swagger UI (try calls while signed in)
- `https://<romm>/api/redoc` — ReDoc
- `https://<romm>/openapi.json` — the OpenAPI 3.1 document; `romm-openapi.json` here is the copy from RomM 5.4.1

Refresh the copy with `curl -sS https://<romm>/openapi.json -o docs/romm-openapi.json`.

## What ChickenTender calls (`py_modules/chickentender/romm.py`)

| Call | Purpose |
| --- | --- |
| `GET /api/heartbeat` | server version and feature flags, no auth |
| `POST /api/auth/device/init` | start pairing: returns `user_code` and `device_code`, no auth |
| `POST /api/auth/device/token` | poll with `device_code` until approved: `access_token`, `device_id` |
| `GET /api/users/me` | who the token belongs to |
| `PUT /api/devices/{id}` | describe this device (client, version) |
| `GET /api/platforms` | platforms with `rom_count` |
| `GET /api/roms?limit&offset&order_by=name` | the library, paged (`with_*` extras off) |
| `GET /api/roms/{id}` | one game with its `files` |
| `GET /api/roms/{id}/content/{file_name}?file_ids=<id>` | one file of a game; supports `Range` |
| `GET /api/recommendations?limit=20` | the user's personalised feed: `{rom, score, reasons[{facet,value}], seed_rom_id, seed_rom_name}` |
| `GET /api/roms/{id}/similar?limit=12` | games in the library resembling one, from RomM's similarity graph |
| cover and screenshot paths, `platforms[].url_logo` | public images (no token); the Steam webview still cannot fetch them cross-origin, `<img>` tags can |

Auth is `Authorization: Bearer <token>` with the token the pairing returns; scopes are listed in the
spec under `OAuth2PasswordBearer`. Pairing polls answer HTTP 400 with `detail` set to
`authorization_pending`, `slow_down`, `expired_token` or `access_denied`.
