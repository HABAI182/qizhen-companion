# 浙大娘桌面伴侣

制作中。以 v13 原画及官方校标为基准，角色左手（画面右）操作键盘、右手（画面左）操作鼠标。Ctrl+Alt+Z 找回窗口。

当前为 0.1.0 分层动作预览：27 个独立部件、眼睛开闭替换、视线微动、键鼠按压回弹、点头、托盘、设置与透明轮廓命中。当前渲染器是 Canvas 2D，尚未完成 Cubism 网格绑定、CMO3 保存和 MOC3 原生导出。

`npm ci` 后使用 `npm run desktop` 开发；`npm run package:windows` 构建 Windows 安装包。`npm test` 与 `cargo test --manifest-path src-tauri/Cargo.toml --locked` 验证输入状态与原生逻辑。最终可执行文件需 Windows 10/11 与 WebView2。

美术源见 `art/ZjuNiang-v13-parts.psd`、统一坐标的 `public/assets/parts/manifest.json`。PSD 为 RGB、8 bit，嵌入 sRGB，闭眼层默认隐藏。源像素与坐标已读回校验；Cubism 导入、隐藏虹膜边缘补全、饰品背后头发补全和连续眼睑几何仍待完成。校徽的 SVG 路径独立保存，不由生成模型重画。
