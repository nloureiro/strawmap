# strawmap.org

A work-in-progress draft of the Ethereum L1 protocol roadmap, maintained by [EF Protocol](https://protocol.ethereum.foundation).

## Live site

[strawmap-eth.netlify.app](https://strawmap-eth.netlify.app)

## Structure

- `index.html` — Main page with embedded Google Drawing and sidebar FAQ
- `faq.html` — Standalone FAQ page
- `shared.css` — Shared styles
- `eth.svg` — Ethereum logo
- `og-card.png` / `og-card.svg` — Open Graph card assets
- `netlify.toml` — Netlify deployment config

## Development

Serve locally with any static server, e.g.:

```
python3 -m http.server 8765
```

## Deployment

Hosted on Netlify. Push to `main` to deploy, or manually:

```
npx netlify-cli deploy --prod
```
