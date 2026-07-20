# 价值观纠正器 ValuesCorrector

一个加密货币「价值观」换算器：把任意金额在加密货币、法币和现实物品之间实时换算——1 个 BTC 等于多少碗猪脚饭，一目了然。

**在线使用：<https://wolfyxbt.github.io/ValuesCorrector/>**

<img width="1728" height="959" alt="网页界面" src="https://github.com/user-attachments/assets/0e112bfc-159f-42c2-96f0-5c1da16cbe91" />
<img width="2822" height="1612" alt="分享图示例" src="https://github.com/user-attachments/assets/c09b1541-e85a-4d72-9211-73c61f801977" />

## 功能

- **多资产实时换算**：6 个栏位联动，任意一栏输入，其余栏位即时换算
  - 加密货币：BTC / ETH / SOL / BNB / OKB，行情来自 CoinPaprika，另支持搜索任意自定义代币（CoinGecko）
  - 法币：USD / CNY / TWD / JPY / KRW / SGD / AED / HKD / MYR，汇率来自 ExchangeRate-API
  - 实物：猪脚饭、KFC、iPhone、法拉利、房产等趣味标的
- **算式输入**：输入框支持 `+ - × ÷` 和括号（如 `1+2*3`），点 `=` 或按回车直接得出结果
- **内嵌计算键盘**：手机端在栏位下方、桌面端在栏位右侧，无需系统键盘
- **一键分享图**：当前换算结果生成横版图片，可复制或下载
- **PWA**：可添加到主屏幕，支持离线回退，新版本自动更新

## 技术与结构

纯静态页面，无框架、无构建步骤，四个核心文件：

| 文件 | 职责 |
|---|---|
| `index.html` | 页面骨架（换算栏位由 JS 动态生成） |
| `app.js` | 全部逻辑：资产配置、行情获取、换算、分享图绘制、内嵌键盘 |
| `styles.css` | 样式（响应式：桌面横屏两栏 / 手机竖屏堆叠） |
| `sw.js` | Service Worker：网络优先缓存，按版本号自动清理旧缓存 |

### 核心设计

- **集中资产配置**：所有可换算资产定义在 `app.js` 的 `ASSET_CONFIG` 数组中，下拉选项、logo 映射、汇率换算均由此派生。新增法币或实物只需加一行；新增加密货币还需在 `COINPAPRIKA_TICKER_URLS` 补充行情接口地址。
- **USD 单价表**：不维护 N×N 汇率矩阵，而是维护每种资产相对 USD 的单价 `usdPrices`，任意换算即 `usdPrices[from] / usdPrices[to]`。
- **安全求值**：算式输入用白名单 tokenizer + 调度场算法解析，不使用 `eval`。
- **同源 logo**：币种与站点 logo 均存放在仓库内（`assets/logos/`、`favicon/`），分享图 canvas 绘制无跨域污染问题。
- **本地缓存**：行情短时缓存于 localStorage，减少 API 调用；换算状态自动保存、下次打开恢复。

## 本地运行

静态站点，任意 HTTP 服务器即可：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 作者

[@wolfyxbt](https://x.com/wolfyxbt)
