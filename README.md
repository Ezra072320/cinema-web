# cinema-web · 猫头鹰影院前端

基于Vue 3与TypeScript的单影院用户门户和管理后台，配套 [cinema-server](../cinema-server/README.md)。

[项目总览](../README.md) · [后端初始化与配置](../cinema-server/README.md)

本文按2026-10-20当前页面、路由与API封装整理。用户评价和管理营收均已接入真实业务接口，支付与退款仍为模拟业务。

## 环境与运行

建议Node.js 24与npm。项目未在package.json中强制锁定Node引擎；当前Node测试直接导入TypeScript工具，已在Node 24下验证。

在本目录执行：

```sh
npm ci
npm run dev
```

默认地址为 [http://localhost:5173](http://localhost:5173)，端口冲突时以Vite终端输出为准。后端应已按[后端README](../cinema-server/README.md)初始化数据库并监听8080。

| 命令 | 用途 |
| --- | --- |
| npm ci | 按package-lock.json安装依赖 |
| npm run dev | Vite开发服务器 |
| npm run type-check | vue-tsc类型检查 |
| npm run build | vue-tsc构建检查后生成dist |
| npm run preview | 本地预览已构建的dist |
| npm run lint | ESLint检查（eslint.config.mjs，只抓真问题不管格式） |
| npm run lint:fix | ESLint自动修复 |
| npm run format | Prettier格式化src下ts/vue/scss（可选，不强制全库重排） |
| npm run test:ai | SSE解析、站内链接白名单及动作时间解析测试 |
| npm run test:revenue | 日期区间、上期比较、CSV格式及完整导出测试 |

生产构建目标为ES2022。预览服务器用于本地检查，不代替正式静态部署。

## 后端连接

[vite.config.ts](vite.config.ts)定义同源代理：

```text
浏览器 /api/...
    → Vite
    → http://localhost:8080/api/...
```

API默认前缀为/api，可使用本地环境文件配置：

```dotenv
VITE_API_BASE=/api
```

Axios与SSE请求都使用该前缀。Vite环境变量在启动／构建时读取，修改后需重启开发服务或重新构建。

当前验证码图片地址在captchaApi中固定为/api/captcha/image，单独把VITE_API_BASE改成跨域地址不会同步改动图片地址。完整部署优先保留同源/api代理；需要跨域时同时核对验证码、后端CORS和流式请求。

当前安装的Vite版本在未单独设置preview.proxy时沿用server.proxy，因此本配置下npm run preview也可转发/api；正式静态服务器仍需自己配置代理，不能依赖Vite设置。

## 页面与入口

### 用户门户

| 路径 | 页面与行为 |
| --- | --- |
| /main | 首页、本店影片展示及排行榜 |
| /movie | 影片分页列表 |
| /movie/:id | 影片详情、演职、图片、预告片、想看、公开评价与本店评分 |
| /hall、/hall/:movieId | 影厅与影片排期 |
| /seats/:scheduleId | 场次座位、座型与票价；下单需用户登录 |
| /pay/:orderId | 本人订单模拟付款与超时倒计时 |
| /order/:orderId | 本人订单详情、取消、退款、评价入口 |
| /score/:movieId/:orderId | 独立评价编辑页，USER登录；影片归属由后端订单上下文决定 |
| /me/info | 本人资料与头像 |
| /me/orders/:status | 本人订单列表；5表示全部，分页由当前前端列表处理 |
| /me/wants | 本人想看清单 |
| /me/reviews | 本人评价分页、修改、删除与订单入口 |
| /ai | AI客服页；查询会话和办理业务需USER身份 |

影片、影厅与座位展示可供游客浏览。支付、订单和AI页面的部分入口没有单独设置路由auth元数据，但后端接口仍要求登录及资源归属，不应将页面可打开理解成业务免鉴权。

### 账户入口

| 路径 | 用途 |
| --- | --- |
| /auth/login | 用户登录 |
| /auth/register | 用户注册 |
| /auth/adminLogin | 管理员登录 |
| /auth/reset | 验证原密码后修改密码，不是短信或邮件找回 |

旧路径/login、/register、/adminLogin、/reset会重定向至对应/auth入口。

### 管理后台

所有/manage页面继承ADMIN登录要求。

| 路径 | 功能 |
| --- | --- |
| /manage/overview | 真实经营概览 |
| /manage/users | 用户管理 |
| /manage/admins | 管理员管理 |
| /manage/movies | 影片同步、补缺、人工核实与字段保护 |
| /manage/halls | 影厅管理 |
| /manage/halls/:id | 影厅详情 |
| /manage/halls/:id/seats | 座位图草稿、编辑、发布及版本 |
| /manage/schedules | 排片列表／时间轴、批量排片、拖拽和同批改期、取消场次 |
| /manage/orders | 订单分页、状态筛选与详情抽屉 |
| /manage/revenue | 日期筛选、营收趋势、排行、每日明细和CSV导出 |

座位模板页面文件与API封装仍在，但/manage/seat-templates没有挂载路由；旧版电影类型、演员、角色维护页面也不属于当前菜单。未知路径进入404，角色不匹配进入/403。

## 主要业务交互

### 选座与订单

- 座位按后端返回的场次锁定版本渲染，页面展示座号，提交下单时使用ticketId。
- 标准、VIP、情侣、无障碍座位分别展示；情侣座映射为两个实体票，须整对购买；每单最多6张实体票。
- 总价按返回的实际票价合计，不在前端重新用影厅容量或基础票价估算。
- 订单付款时限为15分钟；前端倒计时提示，服务端再次判断是否超时。
- 支付页提供WECHAT、ALIPAY、CARD三个模拟渠道，没有跳转真实第三方支付通道。
- 未付款使用“取消订单”；已付款按后端退票规则办理退款。退款金额与退款资格以服务端结果为准。

### 独立评价

- 从订单或“我的评价”进入；编辑前加载本人订单上下文和可评价时间。
- 已散场的有效付款订单一单一评；前后端校验1～5分，短评选填、最多1024字符单元。
- 支持预填、保存、修改、删除确认、未保存离开提示、版本冲突及明确重新载入。
- 影片公开评价提供遮蔽昵称、分页、时间／评分排序、均分与分布；本店五分制与外部来源评分分开展示。
- 退款／取消等不再满足公开条件的历史记录在个人页显示未公开状态。
- 评价不改变订单状态，通过普通评价接口办理，不依赖AI。评价页和“我的评价”不显示通用AI悬浮入口。

详见 [评价模块说明](../cinema-server/docs/review-module.md)。

### 管理营收

- 快捷区间：今日、近7天、近30天、本月、上月；自定义日期不得晚于今天，最多366天。
- 支持日／周／月趋势、等长上期比较、收款金额、实退金额、净营收、付款订单、每单收款与退款单比例。
- 展示订单状态构成、影片／影厅净营收前10名、每日明细分页。
- 导出区间全部每日数据或当前前10名排行，不局限于当前明细页；CSV保留两位小数及中文BOM，转义引号、换行和公式前缀。
- 地址参数start、end、grain保留筛选；未应用的筛选有提示；请求失败显示重试并禁用导出。
- 报表按下单日期归属，退款回计原单；缺失／异常旧退款单独提示，不补造金额。净营收不代表现金流或利润。

详见 [营收口径](../cinema-server/docs/revenue-report.md)。图表样例使用已清理的测试订单数据，不是实际经营结果。

### AI客服

- SSE流式对话，支持停止、重试、会话切换、历史恢复和删除。
- 支持实时查询、站内页面跳转，以及从后端获取的真实待确认服务单；点击确认／撤销后更新办理状态。
- Markdown经过DOMPurify处理，业务链接只接受实现中的站内路径；不依据模型文字伪造办理按钮。
- 流式接口返回JSON字符串token与显式错误帧，通过 [utils/ai.ts](src/utils/ai.ts)解析，不能直接拼接原始SSE文本。
- 旧评价拟单代码及文案仍保留于客服后端，未完全同步新版评价语义；独立评价以订单和“我的评价”页面为准。
- 客服不直接支付，不收集密码或验证码，也没有已接通的人工客服、积分、优惠券或发票业务。

## 工程结构

```text
src/
├── main.ts                     # Element Plus、全局组件与应用挂载
├── App.vue                     # 应用根组件
├── api/
│   ├── http.ts                 # Axios实例、R解包、401处理、SSE请求
│   └── index.ts                # 各领域API封装
├── components/                 # 影片、评价、消息入口和状态组件
├── composables/                # useAuth、useSeatGrid
├── layouts/                    # PortalLayout、AdminLayout、AuthLayout
├── router/                     # 路由、标题、登录和角色守卫
├── stores/                     # Pinia与持久化auth
├── styles/
│   ├── theme.scss              # 暗色、暖金／酒红设计令牌
│   └── echarts-theme.ts        # ECharts主题
├── types/                      # DTO、业务记录与枚举
├── utils/                      # 订单、用户、影片、AI与报表工具
└── views/
    ├── auth/
    ├── portal/                 # 含个人中心me/
    └── admin/
tests/
├── ai.test.mjs
└── revenue.test.mjs
```

主要依赖：Vue 3.5、TypeScript 5.7、Router 4.5、Pinia 3、Element Plus 2、Vite 6、Axios、ECharts 5、marked与DOMPurify。实际依赖范围及安装版本以package.json和package-lock.json为准。

## API与状态约定

- [api/http.ts](src/api/http.ts)统一判断code=1并返回data，页面不应再次访问.data.data。
- 分页对象通常是total和rows；有些旧接口返回完整数组，页面自行分页，不能混用分页协议。
- Authorization来自auth store。token、role、profile持久化到localStorage，lastFetchedAt不持久化。
- 普通401清除登录态并转到用户或管理员登录页，保留redirect；路由守卫根据auth与role元数据处理访问。
- useAuth集中处理登录、注册、资料加载、改密和退出；注册成功后仍需登录。
- HTTP 200未必代表业务成功；座位发布还需检查业务结果，不能只关闭对话框。
- 时间字段主要来自后端中国时区格式；营收日期采用中国时区“今天”，日期区间计算避免浏览器时区和夏令时偏移。

新增页面时优先复用PageSkeleton、EmptyState、ErrorState、StatCard，以及MovieReviews／ReviewCard等领域组件。新接口统一加入api和types，保持页面中的业务状态可追踪。

## 构建与静态部署

```sh
npm run test:ai
npm run test:revenue
npm run build
```

build已包含vue-tsc检查，输出dist，不生成生产source map。不要把node_modules、临时验证页或本地令牌文件作为部署产物。

同源Nginx配置示例，需替换静态目录：

```nginx
server {
    listen 80;
    server_name localhost;
    root /srv/cinema-web/dist;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 180s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

/api代理保留原路径，不能误删前缀。History路由必须回退index.html，否则刷新电影详情或后台子页面会404。SSE需关闭代理缓冲；后端地址、TLS与实际超时按部署环境调整。

## 常见问题与现有边界

| 现象 | 排查方向 |
| --- | --- |
| /api请求404或连接失败 | 后端是否8080、Vite代理是否生效、VITE_API_BASE是否正确 |
| 验证码不显示 | 同源/api图片地址、后端验证码端点及Redis |
| 登录后仍然401 | 令牌是否有效、JWT密钥是否变化、是否登录了正确角色 |
| 管理页403 | USER不能访问ADMIN页面或统计接口 |
| 想看或订单没有数据 | 是否为当前账号、是否有真实业务记录，而不是只有影片资料 |
| 图表金额为零 | 是否选错下单日期，是否有已确认付款单，旧退款是否因缺项被排除 |
| 改密校验不一致 | 前端页面与后端DTO的个别长度范围仍有差异，不能以页面提示代替接口校验 |
| 管理端订单详情回查失败 | 当前回查沿用本人订单详情接口，受订单归属限制；抽屉保留列表行信息 |
| 刷新深层页面404 | 静态服务器未配置History回退 |
| AI回复结束前卡住或中断 | 后端模型连接、流式错误、代理缓冲与读取超时 |

前端路由守卫只是界面层约束，最终权限和金额判断在后端。接口返回、业务完成状态与页面文案不一致时应先核对领域服务，不以客服自然语言作为办理成功凭证。
