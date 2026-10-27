import { defineConfig } from 'vitepress'

// GitHub Pages 项目站点部署在 https://<user>.github.io/<repo>/ 下，
// base 必须与仓库名一致，否则资源路径 404。
// 注意：head 里的 href 不会被自动加上 base，必须手动拼接。
const base = '/NBrowser/'

export default defineConfig({
  base,
  lang: 'zh-CN',
  title: '牛Browser',
  description: '面向个人投资者的桌面端浏览器：看盘 → 研究 → 复盘，一个窗口搞定。',
  head: [['link', { rel: 'icon', href: `${base}logo.svg` }]],
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: 'GitHub', link: 'https://github.com/456wyc/NBrowser' }
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/456wyc/NBrowser' }],
    outline: [2, 3],
    footer: {
      message: '本软件仅供学习与技术交流，不提供任何投资建议。',
      copyright: 'Copyright © 2026 NBrowser contributors · MIT License'
    },
    search: {
      provider: 'local'
    }
  }
})
