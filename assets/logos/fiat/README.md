# Circular fiat flags

Unmodified SVGs from [HatScripts / Circle Flags](https://github.com/HatScripts/circle-flags), downloaded September 13, 2026. Distributed under the included MIT license. Each file is a self-contained 512 × 512 circular illustration with transparent corners; no fonts or remote resources are required.

| Currency | Flag file |
| --- | --- |
| USD | us.svg |
| CNY | cn.svg |
| TWD | tw.svg |
| JPY | jp.svg |
| KRW | kr.svg |
| SGD | sg.svg |
| AED | ae.svg |
| HKD | hk.svg |
| MYR | my.svg |

The mapping lives in `ASSET_CONFIG` in `app.js`, shared by dropdowns and the share image. ExchangeRate-API supplies quotes independently of these bundled images.

The full set of 248 two-letter country/region SVGs is bundled for extension, plus `european_union.svg` and `sh-hl.svg`. Images are separate files: unused flags are not downloaded by the browser. Search-result images load lazily.

Custom fiat support in `fiat.js` uses an explicit currency-to-flag mapping. The searchable list is derived from valid positive quotes returned by the existing API, with Chinese and English names supplied by browser `Intl.DisplayNames`. Regional/shared units without a single representative flag (XAF, XCD, XDR, XOF, XPF), as well as new unmapped codes, receive a local circular currency-code SVG badge. No image API is needed.

Custom selections use `FIAT:CODE` keys, preserving crypto identifiers and restoring their options before saved values are applied. Quotes are always refreshed from the existing fiat cache/API; saved selections never carry an invented quote.
