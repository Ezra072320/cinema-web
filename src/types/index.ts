/**
 * 全局类型声明.
 *
 * 与后端 {@link edu.czu.cinema.common.api.R} 配套使用.
 *
 * 设计要点:
 * - 业务状态全部用字面量联合,禁用魔法数字.
 * - 列表分页统一用 {@link PageResult}.
 * - 时间统一用 ISO 字符串;前端需要时再转 Date.
 */

// ===== 通用响应 =====

export interface R<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export interface PageResult<T> {
  total: number;
  rows: T[];
}

export interface PageQuery {
  page?: number;
  limit?: number;
}

// ===== 枚举(字面量联合) =====

export type Role = 'USER' | 'ADMIN';

export type MovieStatus = 'CLASSIC' | 'NOW' | 'SOON';
export const MOVIE_STATUS: Record<MovieStatus, string> = {
  CLASSIC: '经典',
  NOW: '热映',
  SOON: '即将上映',
};

/**
 * 影厅类型.
 *
 * ⚠️ 后端 `hall.type` 是**数字**: 1 标准2D / 2 标准3D / 3 IMAX2D / 4 IMAX3D
 * (见 `Hall.java` 字段注释，与原项目 `cdu.czm.cinema1.entity.Hall` 一致)。
 *
 * 这里曾经写成 `'STANDARD' | 'IMAX' | '4DX' | 'VIP'` 字符串联合 —— 那套词表是凭空造的，
 * 后端根本不认，新增影厅时直接
 * `JSON parse error: Cannot deserialize value of type java.lang.Integer from String "STANDARD"`。
 * 显示名一律走 {@link hallTypeLabel}，不要再自己拼。
 */
export type HallType = 1 | 2 | 3 | 4;

export const HALL_TYPE_LABEL: Record<number, string> = {
  1: '标准2D',
  2: '标准3D',
  3: 'IMAX2D',
  4: 'IMAX3D',
};

export function hallTypeLabel(type: number | undefined | null): string {
  return HALL_TYPE_LABEL[type ?? 1] ?? '标准2D';
}

/**
 * 座位类型. 后端 `seat.type` 是**数字**: 1 标准 / 2 情侣 / 3 VIP / 4 无障碍.
 *
 * 这里曾经另有一套 `SEAT_TYPE: Record<'STANDARD'|'COUPLE'|'VIP', string>` 字符串词表,
 * 于是 `SEAT_TYPE[seat.type]`(数字 2) 恒为 undefined, 座位标签全是空白. 已删除 ——
 * 一个没人用、键的类型还跟真实数据对不上的映射, 留着就是下一次同样的 bug.
 */
export type SeatType = 1 | 2 | 3 | 4;

/** 座位类型的中文名. 显示名一律走 {@link seatTypeLabel}, 不要自己拼. */
export const SEAT_TYPE_LABEL: Record<number, string> = {
  1: '标准',
  2: '情侣',
  3: 'VIP',
  4: '无障碍',
};

export function seatTypeLabel(type: number | undefined | null): string {
  return SEAT_TYPE_LABEL[type ?? 1] ?? '标准';
}

/** 一个格子在界面上应该画成哪种样式. 与 {@link SEAT_TYPE_LABEL} 一一对应, 外加"过道". */
export type SeatVisualType = 'standard' | 'couple' | 'vip' | 'accessible' | 'aisle';

/**
 * 把一个座位的 (status, type, 是否成对) 归到**唯一**一个视觉类型.
 *
 * 三个页面(座位图编辑器 / 影厅预览 / 选座页)都用它决定格子长什么样, 这样:
 *   - 同一份数据在三处画出来一定一样;
 *   - 不会像以前那样各写各的 `:class` 判断, 结果**无障碍在其中两处整个漏掉**.
 *
 * 判据顺序也就是优先级:
 *   1. `status !== 1` → 过道/不可用(没有座位);
 *   2. `type === 3 / 4` → VIP / 无障碍. 这两个是**物理属性**, 优先于配对关系显示;
 *   3. 成对 或 `type === 2` → 情侣;
 *   4. 其余 → 标准.
 *
 * @param seat 座位. 只用到 status / type. `null` 视为过道.
 * @param paired 该座位是否属于某个情侣对. 预览页拿不到配对数据时不传 ——
 *               配对关系在后端会同步写成 `type=2`, 所以 `type` 本身就能兜住.
 */
export function seatVisualType(
  seat: { status?: number | null; type?: number | null } | undefined | null,
  paired = false,
): SeatVisualType {
  if (!seat || seat.status !== 1) return 'aisle';
  if (seat.type === 3) return 'vip';
  if (seat.type === 4) return 'accessible';
  if (paired || seat.type === 2) return 'couple';
  return 'standard';
}

export type OrderStatus = 'UNPAID' | 'PAID' | 'CANCELED' | 'REFUNDED' | 'USED' | 'ALL';
export const ORDER_STATUS: Record<OrderStatus, string> = {
  UNPAID: '待支付',
  PAID: '已支付',
  CANCELED: '已取消',
  REFUNDED: '已退款',
  USED: '已使用',
  ALL: '全部',
};

/**
 * 订单状态按**后端数字枚举**映射(Order.java: 1 待支付 / 2 已支付 / 3 已退款 /
 * 4 已关闭(超时/手动取消) / 5 查询哨兵 / 6 已完成（存量）；评价状态由reviewed独立表示.
 * 2026-10-19 改造: 4 由"退款中"(死状态)改为"已关闭"——超时关单与用户主动取消共用.
 */
export const ORDER_STATUS_NUM: Record<number, string> = {
  1: '待支付',
  2: '已支付',
  3: '已退款',
  4: '已关闭',
  6: '已完成',
};

/**
 * 场次状态(落库): 1 正常 / 2 已取消.
 * "已放映"不落库, 由 endTime < now 推导.
 */
export type ScheduleDbStatus = 1 | 2;

export type UserStatus = 'NORMAL' | 'DISABLED';
export const USER_STATUS: Record<UserStatus, string> = {
  NORMAL: '正常',
  DISABLED: '已停用',
};

export type PayChannel = 'WECHAT' | 'ALIPAY' | 'CARD';
export const PAY_CHANNEL: Record<PayChannel, string> = {
  WECHAT: '微信支付',
  ALIPAY: '支付宝',
  CARD: '银行卡',
};

// ===== 用户/管理员 =====

export interface UserProfile {
  id: number;
  name: string;
  age: number;
  pic: string;
  status: UserStatus | number;
  createTime?: string;
}

/**
 * 管理员账号;字段与 {@link UserProfile} 一致,通过 role='ADMIN' 区分.
 * 后端在 `/admin/list` 中返回.
 */
export type Admin = UserProfile;

export interface LoginPayload {
  name: string;
  password: string;
}

/** 图形验证码请求/响应契约 */
export interface CaptchaCheckPayload {
  ticket: string;
  code: string;
}

// ===== 影片 / 类型 / 演职 =====

export interface MovieType {
  id: number;
  name: string;
}

/**
 * 真实人物 (2026-10-16 翻新). 老 {@link Actor} 改 alias.
 * 字段全部 optional 以兼容老 data.
 *
 * 注意: pic 兼容老 actor 的 `pic` 字段 (实际后端用 profileUrl).
 */
export interface Person {
  id: number;
  name: string;
  /** 兼容字段: 老代码读 actor.pic,实际数据走 profileUrl. */
  pic?: string;
  originalName?: string;
  /** 0 未知 / 1 男 / 2 女 (新), 老代码传 'M'|'F'|'O' 也兼容. */
  gender?: 0 | 1 | 2 | 'M' | 'F' | 'O';
  birth?: string;
  death?: string;
  biography?: string;
  profileUrl?: string;
  imdbId?: string;
  maoyanId?: number;
  createTime?: string;
}

/** 兼容老代码: 老 actor 字段用 Person 表达. */
export type Actor = Person;

export interface MovieRole {
  id: number;
  movieId: number;
  actorId: number;
  roleName: string;
  /** 后端 listById 关联后返回 */
  actor?: Actor;
}

export interface MovieCastVO {
  person: Person;
  /** 饰演角色 (仅 ACTOR) */
  character?: string;
  order: number;
}

export interface MovieCrewVO {
  person: Person;
  /** 1 ACTOR / 2 DIRECTOR / 3 SCREENWRITER */
  roleType: 1 | 2 | 3;
  characterName?: string;
  jobName?: string;
  order: number;
}

export interface MovieImage {
  id: number;
  movieId: number;
  /** 1 POSTER / 2 BACKDROP / 3 STILL / 4 LOGO */
  kind: 1 | 2 | 3 | 4;
  url: string;
  width?: number;
  height?: number;
  language?: string;
}

export interface MovieVideo {
  id: number;
  movieId: number;
  /** "mp4" / "YouTube" */
  site: string;
  videoKey: string;
  name?: string;
  videoType?: string;
  embedUrl: string;
}

/** 影片数据来源. DOUBAN 仅存量历史影片使用，同步不再产生豆瓣来源。 */
export type MovieDataSource = 'MANUAL' | 'MAOYAN' | 'DOUBAN' | 'TMDB';

export interface Movie {
  id: number;
  title: string;
  summary?: string;
  score: number;
  releaseDate: string;
  area: string;
  status: MovieStatus | number;
  /** 大陆市场状态，与本店排片状态分开。 */
  marketStatus?: 0 | 1 | 2;
  hasSchedules?: boolean;
  scheduleCount?: number;
  nextShowTime?: string | null;
  tmdbId?: number;
  scoreSource?: string;
  lastSyncedAt?: string;
  missingFields?: string[];
  lockedFields?: MovieMetadataField[];
  manualRevision?: number;
  lastRepairAt?: string;
  typeNames?: string[];

  /* ===== 2026-10-16 翻新字段 ===== */
  originalTitle?: string;
  language?: string;
  /** 时长(分钟)。0 = 待映影片尚未公布时长（合法状态，非缺失）。 */
  runtimeMin?: number;
  posterUrl?: string;
  backdropUrl?: string;
  trailerUrl?: string;
  cat?: string;
  dir?: string;
  source?: MovieDataSource;
  maoyanId?: number;
  showDays?: number;
  firstDayBox?: number;
  totalBox?: number;
  fmt?: string;
  wishCount?: number;
  scoreCount?: number;
}

/**
 * 票房榜条目 (`/api/movie/loadSoldLimit50`).
 *
 * 注意它不是 {@link Movie} —— 后端只投影了榜单需要的几列, 别当完整影片对象用.
 */
export interface MovieSoldVO {
  movieId: number;
  title: string;
  posterUrl: string;
  /** 影院销售额榜: 本店真实已支付票款(已剔除待支付/退款/作废); 公开票房榜恒 0. */
  boxOffice: number;
  soldCount: number;
  /** 公开票房榜: 全国累计票房(外部公开数据, 元); 影院销售额榜仅为参考值. */
  totalBox?: number;
}

/**
 * 影片数据同步的进度快照 (`/api/admin/movie/sync/status`), 对应后端 `MovieSyncStatus`.
 *
 * 同步要跑几分钟, 前端靠 2 秒一次的轮询显示进度条.
 * SYNC 模式只新增库中没有的大陆待映影片；已有影片跳过，不修改。
 */
export type MovieMetadataField = 'summary' | 'runtimeMin' | 'releaseDate' | 'cat' | 'dir' | 'area' | 'language' | 'posterUrl';
export interface MovieMetadataEdit {
  fields: Partial<Record<MovieMetadataField, string>>;
  unlockFields: MovieMetadataField[];
  expectedRevision: number;
}

export interface MovieSyncStatus {
  running: boolean;
  /** 待同步影片总数. */
  total: number;
  /** 已处理数(含失败). */
  done: number;
  ok: number;
  fail: number;
  /** 当前正在抓取的片名. */
  current?: string | null;
  /** epoch millis; 从未跑过为 0. */
  startedAt: number;
  /** epoch millis; 未结束为 0. */
  finishedAt: number;
  /** 逐部结果, 失败项带原因. */
  created: number;
  updated: number;
  /** 已存在跳过（SYNC 模式）/ 来源暂无新增资料（REPAIR 模式）. */
  skipped: number;
  partial: number;
  pending: number;
  message: string;
  state: 'IDLE' | 'DISCOVERING' | 'UPDATING' | 'REPAIRING' | 'COMPLETED' | 'FAILED';
  mode?: 'SYNC' | 'REPAIR';
  results: Array<{ title: string; ok: boolean; message: string; movieId?: number; missingFields?: string[] }>;
}

export interface MovieSyncOverview {
  total: number;
  incomplete: number;
  upcomingDays: number;
  lastSyncedAt: string;
  source: string;
}

export interface MovieDetail extends Movie {
  /** 当前登录用户是否想看;未登录为 false */
  isWant: boolean;
  /** 演职 (与 cast 等价) */
  actors?: Actor[];
  types?: MovieType[];
  /** 导演 (Person) */
  director?: Person;
  /** 编剧 (Person[]) */
  writers?: Person[];
  /** 主演 + 角色 (cast = actor + character) */
  cast?: MovieCastVO[];
  /** 完整演职 (导演/编剧/演员) */
  crew?: MovieCrewVO[];
  /** 海报/剧照列表 */
  images?: MovieImage[];
  /** 预告片列表 */
  videos?: MovieVideo[];
  /** 标签 */
  tags?: string[];
  /** 数据来源声明 (e.g. "本数据来源于猫眼电影") */
  dataSourceAttribution?: string;
}

// ===== 影厅 / 座位 =====

export interface Seat {
  id: number;
  hallId: number;
  x: number;
  y: number;
  /** 1=可售座位, 0=过道/不可用(早先注释写反了). */
  status: number;
  type: SeatType | number;
}

export interface Hall {
  id: number;
  name: string;
  /** 1 标准2D / 2 标准3D / 3 IMAX2D / 4 IMAX3D. 见 {@link hallTypeLabel} */
  type: HallType | number;
  /**
   * 座位数. **由座位图算出来, 不手填** —— 后端在发布座位图时写入
   * "当前版本里 status=1 的座位数"。
   *
   * 建厅时是 `0`（还没画座位图），所以展示时要区分"0 座"和"未画座位图"。
   * 门户影厅列表显示的就是这个值，所以它反映的是真的画了多少座位。
   */
  capacity: number;
  /** 当前生效的座位图版本 id */
  currentVersionId?: number | null;
  seats?: Seat[];
  /**
   * 当前生效版本里的情侣对. **只有影厅详情接口下发**, 列表接口不带.
   *
   * 前端据此把一对的两个格子合并成一个视觉单元 —— 不能靠"相邻两个 type=2"去猜:
   * 一排里连着两个情侣对时猜不出边界.
   */
  coupleGroups?: SeatCoupleGroup[];
}

// ===== 座位模板 (Phase 1: 2026-10-16 引入) =====

/**
 * 模板里的一个座位单元. 一行一列 = 一行记录.
 *
 * 0 = 无座位(过道/留空), 1 = 标准, 3 = VIP, 4 = 无障碍.
 * 情侣对不在这里表达, 而是后续 Phase 4 引入的 `seat_couple_group` 表:
 * 2 个物理座位 + 后端绑定, 售出时是 2 条 ticket.
 */
export interface SeatTemplateUnit {
  id?: number;
  y: number;
  x: number;
  status: 0 | 1 | 3 | 4 | number;
  label?: string;
}

export interface SeatTemplate {
  id: number;
  name: string;
  description?: string;
  rowsCount: number;
  colsCount: number;
  createTime?: string;
  /** 仅详情接口返回. */
  units?: SeatTemplateUnit[];
  /** 仅列表接口返回, 模板下的单元总数. */
  unitCount?: number;
}

// ===== 排片 =====

export interface Schedule {
  id: number;
  movieId: number;
  hallId: number;
  /**
   * 本场次锁定的座位图版本 (`hall_seat_version.id`).
   *
   * 排片那一刻定下来的, 之后管理员改影厅座位图并发布新版本也不会改这个值 ——
   * 老场次继续用当初那张座位图, 已售出的票永远能对上座位.
   */
  seatVersionId?: number;
  startTime: string;
  endTime: string;
  /** 基础票价. */
  price: number;
  /** VIP 座倍率, 乘基础票价. 每场可不同, 默认 3.00. */
  vipPriceMultiplier?: number;
  /** 情侣座倍率, 乘基础票价. 每场可不同, 默认 2.50. */
  couplePriceMultiplier?: number;
  status: ScheduleDbStatus | number;
  /** 批量排片批次号。同批共享; 单场排片与历史数据为 null —— 拖拽改期时据此弹批量确认. */
  batchId?: string | null;
  movieName?: string;
  hallName?: string;
  poster?: string;
  /** 该场次已被售出的 seatId 列表(供选座页使用) */
  soldSeatIds?: number[];
}

// ===== 影厅座位图草稿/发布 (Phase 3/4) =====

export interface HallSeatVersion {
  id: number;
  hallId: number;
  /** 版本号, 从 1 起. */
  version: number;
  templateId?: number | null;
  appliedAt?: string;
  appliedBy?: number | null;
  note?: string | null;
  /** 1 = 当前生效. */
  isCurrent: number;
  /** 1 = 已冻结, 永不可改(老版本). */
  isLocked: number;
  /** 草稿乐观锁版本, 保存时回传. */
  draftLockVersion?: number;
}

/** 一对情侣座. 两个都是真实座位, 各有独立票, 但必须一起买. */
export interface SeatCoupleGroup {
  id?: number;
  hallId?: number;
  versionId?: number;
  seatId1: number;
  seatId2: number;
  label?: string | null;
}

/**
 * 保存草稿的请求.
 *
 * 情侣对用**坐标**引用而不是 seatId: 新增的座位在保存前还没有 id.
 */
export interface SeatDraftSavePayload {
  expectedLockVersion: number;
  seats: Array<{
    id?: number | null;
    y: number;
    x: number;
    status: number;
    unitType?: number;
  }>;
  coupleGroups: Array<{
    y1: number;
    x1: number;
    y2: number;
    x2: number;
    label?: string;
  }>;
}

export interface SeatDraft {
  draft: HallSeatVersion;
  seats: Seat[];
  coupleGroups: SeatCoupleGroup[];
  lockVersion: number;
}

/** 发布草稿的结果. `ok=false` 时 `blockingScheduleIds` 是挡路的未放映场次. */
export interface SeatApplyResult {
  ok: boolean;
  newVersionId?: number | null;
  newVersionNumber?: number | null;
  blockingScheduleIds?: number[] | null;
  message: string;
}

// ===== 选座页数据 (`/api/schedule/{id}/seats`) =====

/**
 * 选座页的一个座位.
 *
 * 关键: 下单传的是 `ticketId`, **不是** `seatId`. 座位是物理位置, 票是这个
 * 场次下这个位置的可售单元, 两者 id 不同.
 */
export interface ScheduleSeatItem {
  seatId: number;
  /** 过道/不可用座位没有票, 为 null, 前端画成不可点的空白. */
  ticketId: number | null;
  /** 票状态: 0 已售/锁定, 1 可售, 2 已退/作废(不可售, 场次取消时全场置 2). 无票时为 null. */
  ticketStatus: number | null;
  y: number;
  x: number;
  /** 1 标准 / 2 情侣 / 3 VIP. */
  type: number;
  /** 座位自身: 0 不可用(过道) / 1 正常. */
  status: number;
}

/** 一对情侣座. 两个都是真实座位, 各有独立票, 但必须一起买. */
export interface ScheduleCouplePair {
  id: number;
  seatId1: number;
  seatId2: number;
  label?: string | null;
}

export interface ScheduleSeats {
  scheduleId: number;
  hallId: number;
  seatVersionId: number | null;
  /** 场次状态: 1 正常 / 2 已取消. 已取消时选座页整页停止售票. */
  status?: number;
  hallName?: string;
  movieName?: string;
  startTime: string;
  /** 基础票价. */
  price: number;
  /**
   * 本场次的 VIP 座倍率.
   *
   * 必须用后端给的值算总价 —— 前端硬编码 3.0 的话, 遇到调过价的场次会显示一个价、
   * 下单扣另一个价. 倍率属于场次, 不是常量.
   */
  vipPriceMultiplier: number;
  /** 本场次的情侣座倍率. 同上. */
  couplePriceMultiplier: number;
  rows: number;
  cols: number;
  seats: ScheduleSeatItem[];
  /** 情侣对. 前端把每对合并成一个视觉单元, 选中时两个一起选. */
  coupleGroups: ScheduleCouplePair[];
}

// ===== 订单 =====

export interface OrderInfo {
  id: number;
  number: string;
  userId: number;
  scheduleId: number;
  movieId?: number;
  totalAmount: number;
  status: OrderStatus | number;
  reviewed?: boolean;
  canReview?: boolean;
  reviewReason?: string;
  reviewAvailableAt?: string | null;
  movieName?: string;
  hallName?: string;
  poster?: string;
  startTime?: string;
  /** 座位可读标签(如「3排5座」), 2026-10-19 起取代旧 seatIds(物理主键). */
  seatLabels?: string[];
  /** 退款落账金额(后端下传, 未退款时为 undefined). */
  refundAmount?: number;
  refundTime?: string;
  createTime?: string;
  payChannel?: PayChannel;
}

// ===== 评价 =====

export interface ScoreRecord {
  id: number;
  orderId: number;
  movieId: number;
  userId: number;
  score: number;
  content?: string;
  createTime?: string | null;
  updateTime?: string | null;
  version: number;
}

export interface ReviewContext {
  orderId: number;
  movieId: number | null;
  movieTitle: string | null;
  hallName: string | null;
  poster: string | null;
  startTime: string | null;
  availableAt: string | null;
  canReview: boolean;
  reason: string;
  review: ScoreRecord | null;
}

export interface ReviewView {
  id: number;
  orderId?: number;
  movieId: number;
  movieTitle?: string;
  poster?: string;
  author: string;
  score: number | null;
  content?: string;
  createTime?: string | null;
  updateTime?: string | null;
  version?: number;
  mine: boolean;
  published: boolean;
  editable: boolean;
  reason?: string;
}

export interface MovieReviewPage {
  total: number;
  rows: ReviewView[];
  summary: { count: number; average: number | null; distribution: Record<string, number> };
}

// ===== 营收 / 概览统计 =====

export interface OverviewStat {
  totalMovies: number;
  totalSchedules: number;
  totalOrders: number;
  totalRevenue: number;
  todayRevenue: number;
  todayOrders: number;
  /** 票房 TopN */
  topMovies?: { movieId: number; title: string; boxOffice: number }[];
  /** 类型分布 */
  typeDistribution?: { name: string; value: number }[];
  /** 最近 7 天营收 */
  revenueTrend?: { date: string; revenue: number; orders: number }[];
}

export interface RevenueMetrics {
  grossRevenue: number;
  refundAmount: number;
  netRevenue: number;
  totalOrders: number;
  paidOrders: number;
  refundOrders: number;
  pendingOrders: number;
  closedOrders: number;
  unknownRefundOrders: number;
  unknownRefundOrderAmount: number;
  averageOrderValue: number;
  refundRate: number;
}
export interface RevenuePeriod {
  label: string;
  startDate: string;
  endDate: string;
  metrics: RevenueMetrics;
}
export interface RevenueRank {
  id: number | null;
  name: string;
  paidOrders: number;
  grossRevenue: number;
  refundAmount: number;
  netRevenue: number;
  share: number;
}
export interface RevenueReport {
  startDate: string;
  endDate: string;
  granularity: 'day' | 'week' | 'month';
  generatedAt: string;
  summary: RevenueMetrics;
  previous: RevenueMetrics;
  previousStartDate: string;
  previousEndDate: string;
  trend: RevenuePeriod[];
  daily: RevenuePeriod[];
  movies: RevenueRank[];
  halls: RevenueRank[];
  statusDistribution: { name: string; value: number }[];
}

// ===== AI 客服 =====

/**
 * 会话历史消息. 后端只落库 user/assistant 两种角色(system 提示词与工具中间结果不入库),
 * ts 是真实毫秒时间戳.
 */
export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
  ts?: number;
  interrupted?: boolean;
  error?: string;
}

export interface AiAction {
  id: string;
  type: 'CREATE_ORDER' | 'CANCEL_ORDER' | 'REFUND_ORDER' | 'SET_WANT' | 'SUBMIT_SCORE' | 'UPDATE_PROFILE';
  title: string;
  summary: string;
  status: 'PENDING' | 'DONE' | 'DISMISSED' | 'EXPIRED';
  expiresAt: string;
  result?: string;
  path?: string;
}

/** 会话(后端 ai_session 表): 标题=首问截断, createTime/updateTime 为 "yyyy-MM-dd HH:mm:ss". */
export interface AiSession {
  chatId: string;
  title: string;
  createTime: string;
  lastMessage?: string;
  updateTime?: string;
}
