# 浙大娘桌面伴侣

浙大娘 0.3.0 是 Windows x64 桌面伴侣，使用 Cubism 5.3 原生模型和 WebView2。桌宠默认在右下角，右键角色可打开互动菜单，托盘提供设置、显示、隐藏和退出。Ctrl+Alt+Shift+R 找回窗口并关闭整窗穿透。

- 角色左手（画面右）操作键盘四区和空格，右手（画面左）跟鼠标移位和按键。视线、闭眼、点头、开心和触碰回弹均驱动 Live2D 模型。每次头部触碰在松手后下压、回弹一次，约 0.4 秒归位。
- 设置覆盖主题、强调色、字号、窗口大小、动作幅度与速度、鼠标视线、按键和气泡的位置与大小、休息、音效、常用位置、穿透、全屏避让和动作快捷键。
- 拖动把手可将角色轮廓贴到屏幕工作区边缘。头发的透明孔洞、边角和气泡可透传。互动菜单可暂停键鼠回应，设置中可预览浮显。「空闲问候」会轮换校园台词，开始操作时空闲问候会收起。
- 便携 EXE 适用于 Windows 10/11，需要 Microsoft Edge WebView2 Runtime。程序在本地处理键鼠输入。

`npm ci` 后使用 `npm run desktop` 开发；`npm run package:windows` 构建 Windows 安装包。`npm test` 与 `cargo test --manifest-path src-tauri/Cargo.toml --locked` 验证输入状态与原生逻辑。最终可执行文件需 Windows 10/11 与 WebView2。

可编辑源是 `art/ZjuNiang-v14-layered-source.psd` 与 `art/ZjuNiang-v14-rig-wip.cmo3`。PSD 为 51 层 RGB、8 bit、sRGB，两只虹膜各有可编辑遮罩。CMO3 使用 37 个参数，运行时含 39 个绘制对象和一张 4096×4096 纹理。校标原矢量与来源位于 `art/source/official-marks`。
