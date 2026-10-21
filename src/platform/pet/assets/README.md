# 南华 · 狐狸桌宠素材

## 当前连续动作版（2026-10-19）

角色正式命名为南华。已制作并接入 20 个动作、140 帧的透明 WebP 图集，详见 [动作清单、制作方式与提示词](motion/README.md)。播放器使用预解码、Canvas 时间轴与动作队列；阅读已改为坐姿并包含拿书/翻页/合书/起身。2026-10-19 已按用户通知完成自动测试、构建与 macOS 功能验证；后续已取消全人物叠影、校准帧间锚点和脚底基线并减少重复绘制；脸型与服装细节仍需精修。

下文六张 PNG 为上一轮静态素材与回退，保留其生成记录。


2026-10-18：沿用用户选定的暖橘长发、狐耳狐尾、墨绿奶白长裙形象，以内置 imagegen 生成。未使用 CLI 或额外 API 密钥。原始参考为用户在对话中指定的日系立绘，项目保存生成后的狐狸素材。

## 上一轮静态素材

| 状态 | 文件 | 触发 |
| --- | --- | --- |
| 待机 | idle-1.png | 普通陪伴 |
| 摸摸 | happy-1.png | 点击、拖动落地后的短暂反馈 |
| 休息 | sleeping-1.png | 菜单休息，点击可唤醒 |
| 招呼 | waving-1.png | 菜单或设置页打招呼 |
| 拖动 | dragging-1.png | 实际拖动期间 |
| 阅读 | reading-1.png | 菜单“一起看书”，可放下书本 |

六张均为 1024×1536 RGBA PNG，共约 13.0 MiB，透明四角 Alpha 均为 0，保留原始生成透明通道。它们是六张状态立绘，配合轻微呼吸/摆动 CSS；不是逐帧角色动画、骨骼模型或 Live2D。阅读只是装饰性陪伴，不读取文稿。构建后运行时无需网络。

## 继续添加帧

文件名为 `<状态>-<序号>.png` 或 WebP，状态可用 idle、happy、sleeping、waving、dragging、reading。构建期自动收集并按自然序号排列；同状态多帧按既有帧率轮播（3 / 7 / 1.4 / 8 / 1 / 2 fps），只有一张时用该图和轻微 CSS 动作。

新帧应保持一致的画布、角色尺度和脚底位置，避免切换跳动；不要只复制同一张图冒充新帧。耳朵、头发、尾巴和裙摆须完整。缺少状态或图片解码失败时回退可用待机图；全部不可用才显示矢量狐狸。系统“减少动态效果”即时停在首帧，隐藏窗口停止帧轮播。预览区固定尺寸并限制图像边界，不让高分辨率图撑开或覆盖按钮。

## 生成提示词记录

以下保留最终采用的提示词，供后续一致性迭代。透明背景开关均为 true；变体以同一狐狸立绘为参考，未把用户参考图打包进应用。

### 待机

Use case: identity-preserve. Asset: production transparent full-body desktop companion sprite, one character only. Use the reference as the exact character identity, not a loose inspiration. Preserve her copper-orange long wavy hair with cream ends, amber eyes, fluffy fox ears, huge orange cream-tipped fox tail, delicate anime linework, green ribbon with gold pen-nib ornament, forest-green high-neck long-sleeved ankle-length dress with gold leaf embroidery, ivory ruffled apron with gold quill/inkpot motif, ivory stockings and green Mary Jane shoes. Same face, outfit, colors, roughly six-head body proportions and soft high-quality anime painting. FULL BODY, ears to shoes completely inside frame with generous 6% safety margins; centered and same standing camera scale, feet aligned near bottom. No lettering, no labels, no panels, no additional characters. CRITICAL: fully remove all background, all colored haze, glow, gradient and shadow. ONLY the character should remain on genuine completely clear alpha transparency; outside hair, tail and body must be empty, no solid black, white or checkerboard, no floating decorations. Calm waiting pose: standing naturally looking toward viewer with a tiny warm closed-mouth smile, both hands gently relaxed together at waist over apron, shoulders level, feet side by side, tail resting curved to her right. Arms lowered, not waving.

### 摸摸

Using the fox girl in the provided image as the EXACT same character, draw a new full-body HAPPY pose. Keep identical copper-orange long hair, fluffy fox ears and one cream-tipped fox tail, forest-green long-sleeved high-neck ankle-length dress, cream ruffled apron with gold quill motif, gold botanical embroidery, green ribbons, cream stockings, green Mary Jane shoes, fine polished anime rendering and body proportions. She is standing, eyes open bright and joyful, smiling with a light blush, hands gently clasped over her heart, fox ears perked. Entire body including ears and shoes within a portrait image with clear margins. One character only, no text, no scenery. Genuinely transparent background, no glow, haze, shadows or gradient.

### 休息

Edit the provided fox-girl into one new POSE sprite. Preserve EXACTLY the same character face, orange long wavy cream-ended hair, fox ears, single orange cream-tipped tail, amber eyes, green ribbon and nib hair ornament, forest-green fully covered high-neck long-sleeved ankle-length dress, gold leaf embroidery, cream ruffled apron with gold quill/inkpot emblem, cream stockings and green shoes. Same refined anime illustration style and body proportions. Full body completely visible from ears to shoes; centered portrait with clear margins. GENUINE transparent background: remove all background RGB haze/glow/shadow and leave only the character against alpha zero outside silhouette. No words or decorations, no different costume. Peaceful sleepy STANDING pose: eyes closed, tiny relaxed smile, head tilted with palms together next to cheek as if dozing, shoulders relaxed, full body standing at same scale, tail curled close. No bed, chair, pillow, Z, moon or floating symbols.

### 招呼（原始形象稿复用）

Use case: stylized-concept. Create a beautiful original fox-girl desktop companion concept for the writing workspace app 墨枢. The attached blue-haired whale maid is a STYLE AND QUALITY REFERENCE ONLY: use its fine Japanese anime rendering, delicate clean linework, expressive large eyes, flowing long hair, intricate layered full-length dress and graceful roughly 5.5 to 6 head full-body proportions. Design a distinct fox girl rather than a whale girl. One single full-body character, head to shoes fully visible with comfortable transparent margins, no panels, no text, no watermark, no scenery. Warm copper-orange long softly flowing hair fading to pale cream ends; two fluffy orange fox ears with cream inner fur; amber eyes and a gentle playful open smile; one enormous fluffy orange fox tail with a cream tip curving clearly to her side. Cute soft round facial features. Elegant modest fully opaque high-neck forest-green long-sleeved ankle-length dress, ivory ruffled collar and cuffs, ivory apron, restrained antique-gold trim with tiny leaf and ink-quill embroidery, green neck ribbon, a small gold pen-nib hair ornament. Ivory stockings and dark green rounded Mary Jane shoes. Fine fabric folds and layered cream underskirt, covered shoulders, no low neckline. Friendly welcoming standing pose, one hand gently raised in a small wave, the other resting near the apron, fingers cleanly rendered. Clear readable hair and tail silhouette for a desktop pet. Polished commercial anime game character illustration, soft delicate shading and crisp edges, forest green, cream and copper palette. Genuine transparent alpha background, no white rectangle or printed checkerboard, no cast ground shadow.

### 拖动

Create a DRAGGED reaction sprite of this exact fox girl, keeping all character design, same detailed anime style, same long orange hair, fox ears and fluffy tail, high-neck long-sleeved green long dress, cream apron, green shoes and gold writing ornaments. Full body. She looks adorably surprised with wide amber eyes and a small o-shaped mouth; arms slightly extended sideways for balance, legs together and shoes pointing a little downward, as if lifted gently off the ground. Keep full dress naturally falling, no wardrobe changes. Entire silhouette inside portrait canvas with clear margins. Single character, no text, no background objects. Transparent background, no glow or floor shadow.

### 阅读

把参考图中这只狐狸少女画成安静看书的姿势。角色长相、橙色长发、狐耳、蓬松狐尾、墨绿色长袖长裙、奶白围裙、金色花纹、袜子鞋子、精致日系插画画风全部保持一致。全身站立，双手在身前捧着一本打开的深绿色小书，低头看书，神情专注温柔。完整露出耳朵和鞋子，四周留边。一张单人全身透明背景立绘，没有场景，没有文字，没有阴影或光晕。
