# dsh-ascii-sharks

在 **DeepSeek Harness 桌面端**界面留白里游泳的 ASCII 鲨鱼与鱼群。

An ambient ASCII ocean for the DeepSeek Harness desktop UI: four sharks and
small fish schools drift through the empty gutters around the conversation,
slip behind the chat surface, and ripple when you click the water.

```
                            ;'
                             %%'
                              .t;.               .oooo
                               S;:S%              %8S8.
                                ;:tt%t '..        XX%%S
t'                            ''XSSS8SSX%XX8#.    %XSX%
  :;'               ;.''X8%8XX%%S%%S%SStt%tSX8S#X8't%ttt.
   ::%'       ''8XXXSSt%Stttttt%8@%%@%8@8%Sttt%%%%SSSSS%tt.
   'SXXtt%t%%%S%:;StS%ttSS%tSXSt88@@%8%@8%tStS%%X%SS%%S%;;t
  .@##88#@...'@@@@#@8@88X88#XXXSX8SX88SX8%SS%S%%S88St%t%%%.
   %;%t             :.    '.'##@###@X#888XX##8@@@#.X%XS%.
  .%t                            ;%%%#@@##@@@.     SXS%%
  t.                            .%;%%%.            %%XXS
                               '%t:t              .SXSS'
                              '::.                ooooo
                             .S'
                             .
```

## 功能

- **水池就是界面留白**：已有对话时是左右两条竖向水道；新建会话时，标题上方和输入框下方的整宽空白也会变成水域，和左右水道连成一圈，鲨鱼可以横穿整个留白。
- **自由随机巡游**：4 种鲨鱼（classic / hammerhead / mako / nurse），每 2.2–5.5 秒随机换向，4–9 秒换一次“心情”（转向决心、横向摆动、巡航速度），软边界让连通水域之间可以自由穿行，不会反复画同一段弧。
- **点击泛起 ASCII 涟漪**：左键点水面，三圈同心、2 个字符厚的波纹向外扩散 2 秒，中心爆出水珠，附近鱼群受惊炸开，并留下青蓝色尾迹光点。
- **点击穿透**：画布是 `pointer-events: none`，水花监听是 passive + capture，点水面不会挡住下面任何按钮、输入框或文本选择，只会起涟漪。
- **不覆盖 UI**：侧边栏、对话正文、输入框、右栏、弹窗都不会被鲨鱼压住；鲨鱼游到对话栏后面会被裁切，视觉上就是从后面穿过去。
- **主题自适应**：深色用深水色，浅色反相墨水色；`prefers-reduced-motion` 下只画一帧静止画面。
- **不瞬移**：布局变化不会重新播种，同一批鱼和鲨鱼会继续游进新水域。

## 安装

需要 DeepSeek Harness Desktop（`desktop` profile）。

1. 克隆本仓库。
2. 在 Harness 的插件管理器里选择 **Install bundle**，指向本仓库的 `ascii-sharks-plugin/` 目录；或让 Agent 调用 `plugin_manager install_bundle`。
3. Host 行会立即激活，Client 模块图会通过插件事件流热更新。若你的 Harness 版本只在启动时组合模块图，重启一次 DSH Desktop（会话会保留）。

关闭：设置 → 插件 → 关掉 **ASCII 鲨鱼 / ASCII Sharks**；卸载：移除 `@local/ascii-ocean` bundle。

> **踩坑记录**：`ascii-sharks-plugin/package.json` 的 `exports` 必须包含
> `"./package.json": "./package.json"`。Desktop 的 Host 进程没有 Node
> internals，Harness 扫描客户端插件清单时走
> `require.resolve('<包名>/package.json')` 的回退路径；缺少这个导出会被
> **静默跳过**——插件显示已启用，但页面上什么都不会出现。

## 目录

| 路径 | 说明 |
| --- | --- |
| `ascii-sharks-plugin/` | 可直接安装的 bundle（`package.json`、`cordis.patch.yml`、Host 半、构建好的 `client.js`、locale、icon） |
| `ascii-sharks-src/` | 构建源码：纯 JS 的海洋/鲨鱼/渲染模块、Harness 入口、`build.mjs` |
| `ascii-sharks-plugin/README.md` | 插件本身的详细设计说明 |

## 构建

`client.js` 是单个自包含的 Client 产物（Harness 模块加载器格式）。修改源码后：

```sh
cd ascii-sharks-src
node build.mjs
node --check ../ascii-sharks-plugin/client.js
```

`world.js` / `renderer.js` 由上游 TypeScript 用 `node:module.stripTypeScriptTypes`
转成纯 JS 后再打补丁；`engine.js` 和 `entry.js` 是为 Harness 新写的胶水层。
`build.mjs` 会从 `../ascii-sharks-plugin/package.json` 读取包名作为模块 id。

## 来源与许可

水下模拟移植自 [stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks)
（TypeScript 源）。**上游仓库没有 LICENSE 文件**，因此移植过来的模拟代码不附带
额外许可；Harness 集成部分（插件清单、水域测量、主题适配、涟漪渲染、入口/引擎）
是为本项目新写的。详见 [NOTICE.md](NOTICE.md)。
