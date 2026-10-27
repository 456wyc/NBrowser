---
layout: home

hero:
  name: 牛Browser
  text: 面向个人投资者的桌面浏览器
  tagline: 看盘 · 研究 · 复盘，一个窗口搞定
  image:
    src: /logo.svg
    alt: 牛Browser
    width: 320
  actions:
    - theme: brand
      text: 前往 GitHub 仓库
      link: https://github.com/456wyc/NBrowser
    - theme: alt
      text: 快速开始
      link: '#快速开始'

features:
  - icon: 📊
    title: 按投资流程分空间
    details: 内置「盯盘 / 研究 / 复盘」三个空间，标签页与登录态彼此隔离；同一网站可在不同空间登录不同账号。
  - icon: 📈
    title: 行情常驻
    details: 自选股行情在侧边栏常驻显示（涨红跌绿，A 股习惯），无需来回切页面看盘，支持自定义与智能分组。
  - icon: 🕒
    title: 自动记录浏览轨迹
    details: 自动把「我在哪只股票上花了多少时间」记录并聚合，解决复盘时「我那天到底看了啥」的问题。
  - icon: 🤖
    title: AI 只做信息整理
    details: 严禁预测价格与买卖建议，只输出事实摘要、利好 / 利空要点、关键数据、存疑点；社区内容标注「观点非事实」。
  - icon: 💬
    title: AI 助手 Copilot
    details: Cmd/Ctrl + K 全局召唤，多轮会话持久化，内置自选 / 持仓 / 研究轨迹 / 笔记等只读数据工具与联网检索。
  - icon: 📝
    title: 交易与复盘闭环
    details: 支持交割单导入与自然语言录入，自动计算盈亏、胜率，逐笔绑定复盘笔记，串联「交易 ↔ 决策依据」。
---

## 截图预览

<div class="shot">
  <img src="/snapshots/image.png" alt="盯盘空间与自选股行情" />
  <p class="cap">盯盘空间：东方财富行情页 + 侧边栏常驻自选股（涨红跌绿）</p>
</div>

<div class="shot-grid">
  <div class="shot">
    <img src="/snapshots/image0.png" alt="AI 信息整理" />
    <p class="cap">🔍 研究：AI 整理当前页，输出利好 / 利空要点与关键数据</p>
  </div>
  <div class="shot">
    <img src="/snapshots/image3.png" alt="笔记与 AI 讨论" />
    <p class="cap">📒 笔记：Markdown 编辑 + 随笔记 AI 讨论</p>
  </div>
  <div class="shot">
    <img src="/snapshots/image1.png" alt="导航首页常用网站" />
    <p class="cap">🏠 导航首页：内置分类常用网站，可自定义分组</p>
  </div>
  <div class="shot">
    <img src="/snapshots/image2.png" alt="自选股卡片" />
    <p class="cap">📈 自选股：卡片网格管理，实时行情联动</p>
  </div>
</div>

## 更多能力

- **AI 量化策略**：用大白话生成策略规则，支持历史回测、实时运行监控（买卖点提示）与手动编辑规则。
- **网页独立窗口（多屏）**：标签可弹出为独立窗口，登录态 / 播放进度全部保留，支持双向搬运与按显示器记忆布局。
- **会话恢复**：重启后按空间还原标签与独立窗口（连同窗口内整组标签摆回原显示器）。
- **本地优先**：数据纯本地单机存储，可一键关闭轨迹记录、按域名屏蔽或一键清空。

## 快速开始

要求 Node 22+ 与 [pnpm](https://pnpm.io/)。

```bash
# 安装依赖
pnpm install

# 启动开发模式（热重载）
pnpm dev

# 运行单元测试
pnpm test

# 打包（Windows NSIS 安装包）
pnpm dist
```

> 行情功能使用公开免费接口，无需任何 Key 即可使用。AI / Copilot / 策略等能力需要在「设置 → LLM」中填写可用的 OpenAI 兼容接口地址与 Key 后启用。

## 获取与下载

本项目当前为 `v0.1.0`（MVP 开发中）。正式安装包会随版本发布到 GitHub Releases。

前往 [GitHub 仓库](https://github.com/456wyc/NBrowser) 查看源码、发布版本与构建产物。

## 技术栈

| 维度 | 选型 |
| --- | --- |
| 运行时 | Electron 32 + Node 22 |
| UI | React 18 + TypeScript 5.7 |
| 构建 | electron-vite 5 + Vite 6 |
| 存储 | sql.js（SQLite WASM，纯内存 + 手动落盘） |
| 行情 | 东方财富 / 腾讯财经公开接口，Provider 可插拔 |
| LLM | OpenAI 兼容 `/chat/completions`，用户自填配置 |

## 合规与免责声明

- 本软件**不提供任何投资建议、目标价预测、买卖点提示**，也不对接任何券商交易下单接口。
- AI 功能仅做信息整理，所有结论须以官方披露为准，投资损益由使用者自行承担。
- 浏览轨迹等隐私数据**纯本地单机存储**，不上传任何服务器。
- 本软件仅供学习与技术研究使用，请遵守所在地区法律法规与证券市场相关规定。

## 开源许可与商标

本项目以 **MIT 许可证** 开源，详见 [LICENSE](https://github.com/456wyc/NBrowser/blob/main/LICENSE)。

「牛Browser」「NBrowser」名称及项目 Logo 为商标 / 品牌资产，其使用受
[TRADEMARKS.md](https://github.com/456wyc/NBrowser/blob/main/TRADEMARKS.md) 约束：
任何二次发布或衍生版本（尤其商业发布）**必须改名并更换独立标识**，不得使用本项目同名与同款 Logo，
也不得暗示与本项目存在关联或官方背书。
