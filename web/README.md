# nanobot web frontend

## Development

```bash
npm install
npm run dev
```

Set token in browser localStorage:

```js
localStorage.setItem("nanobot_token", "YOUR_WEB_TOKEN")
```

## Build

```bash
npm run build
```

This outputs static files to `../nanobot/web/static` for `nanobot gateway` to serve.
