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

For future custom fiat support, bundle additional flags from the same collection and map ISO 4217 currency codes explicitly to flag files. Do not derive a country from the first two currency-code letters: shared currencies such as EUR need an explicit choice. A neutral circular currency-code badge can serve as the fallback for unmapped currencies. This is an extension recommendation; custom fiat selection is not implemented yet.
