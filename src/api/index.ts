import { http } from './http';
import type {
  Admin,
  AiSession,
  Hall,
  LoginPayload,
  Movie,
  MovieCrewVO,
  MovieDetail,
  MovieImage,
  MovieSoldVO,
  MovieSyncStatus,
  MovieVideo,
  OrderInfo,
  PageQuery,
  PageResult,
  PayChannel,
  Schedule,
  ScheduleSeats,
  ScoreRecord,
  Seat,
  SeatApplyResult,
  SeatDraft,
  SeatDraftSavePayload,
  SeatTemplate,
  SeatTemplateUnit,
  HallSeatVersion,
  UserProfile,
} from '@/types';

/**
 * API 模块汇总: 对齐后端 /api/** 的设计.
 *
 * 注意:
 * - 所有方法返回的是"已剥壳"的业务数据(http 拦截器已经把 R<T> 解开成 T).
 * - 写操作统一走 POST/DELETE/PUT,不再用 GET.
 */

interface MovieListParams extends PageQuery {
  title?: string;
  status?: number;
  showing?: boolean;
  incomplete?: boolean;
}

interface ScheduleAdminParams extends PageQuery {
  date?: string;
  hallId?: number;
  movieId?: number;
  status?: number;
}

interface OrderAdminParams extends PageQuery {
  status?: number;
  keyword?: string;
}

interface AdminListParams extends PageQuery {
  name?: string;
  status?: number;
}

type UserListParams = AdminListParams;

/**
 * 下单请求体.
 *
 * ⚠️ **不要带 userId**. 后端 `OrderAddDTO` 只认 scheduleId + ticketIds,
 * 用户身份一律从 token 里取(SecurityUtils.requireUserId) —— 客户端传 userId
 * 既会被 Jackson 判为未知字段直接 400, 也是个越权隐患.
 */
interface CreateOrderForm {
  scheduleId: number;
  ticketIds: number[];
}

interface ScoreForm {
  orderId: number;
  score: number;
  content?: string;
  expectedVersion?: number;
}

/**
 * 建/改影厅.
 *
 * ⚠️ **没有 capacity**. 座位数由座位图算出来 —— 画完座位图并发布之后, 后端按
 * "当前版本里 status=1 的座位数" 写进 hall.capacity. 建厅时不需要也不能指定它.
 */
interface HallForm {
  id?: number;
  name: string;
  type: Hall['type'];
  seats?: Hall['seats'];
}

/** 新增排片. 倍率可选, 不传后端按 3.00 / 2.50. */
interface ScheduleAddForm {
  movieId: number;
  hallId: number;
  startTime: string;
  price: number;
  vipPriceMultiplier?: number;
  couplePriceMultiplier?: number;
}

/**
 * 更新排片.
 *
 * ⚠️ **没有 hallId**. 后端 `ScheduleUpdateDTO` 刻意不收 —— 换厅会让场次挂到 B 厅,
 * 但 `seat_version_id` 和已建的票还留在 A 厅, 选座页会显示"B 厅的名字 + A 厅的座位图".
 * 发过去会被 Jackson 判为未知字段直接 400. 要换厅就删掉重排.
 *
 * 也没有 price/倍率: 票在建票那一刻就把价算好落库了, 改价对已建的票完全无效.
 * 要调价请取消场次后按新价重排.
 */
interface ScheduleUpdateForm {
  id: number;
  movieId: number;
  startTime: string;
}

/** 批量排片请求. 行内 price 为空则随批量基础价. */
export interface ScheduleBatchAddForm {
  movieId: number;
  hallId: number;
  sessions: { startTime: string; price?: number }[];
  price?: number;
  vipPriceMultiplier?: number;
  couplePriceMultiplier?: number;
}

/** 批量排片结果: 冲突/不合法的行被跳过并带原因, 其余已入库. */
export interface ScheduleBatchResult {
  created: { startTime: string; scheduleId: number }[];
  skipped: { startTime: string; reason: string }[];
}

/** 批量改期请求: 同批次同时段(=sourceStartTime 的时刻)整体改到 targetStartTime 的时刻. */
export interface ScheduleBatchMoveForm {
  batchId: string;
  sourceStartTime: string;
  targetStartTime: string;
}

/** 批次同时段规模. */
export interface ScheduleBatchInfo {
  total: number;
  movable: number;
}

/**
 * 登录/注册请求携带 captcha 时使用.
 * 后端在 ticket 存在时原子校验并消费,前端无需单独 /captcha/check.
 */
type LoginWithCaptcha = LoginPayload & { captchaTicket?: string; captchaCode?: string };

/**
 * 注册请求体.
 *
 * - 与 {@link LoginWithCaptcha} 共享 captcha 字段语义.
 * - age 可选,后端默认 0.
 */
type RegisterPayload = {
  name: string;
  password: string;
  age?: number;
} & {
  captchaTicket?: string;
  captchaCode?: string;
};

// ===== 验证码 =====
//
// 设计: 票据制(ticket-based).
// - 前端生成 UUID 作为 ticket.
// - `GET /api/captcha/image?ticket=<uuid>` 后端按 ticket 生成图片并存储答案.
//   必须带 /api 前缀,才能走 vite proxy 到 :8080,否则浏览器直接命中 vite dev server 收 404.
// - `POST /api/captcha/check` 校验 ticket+code,校验通过后 ticket 一次性消费.
// 这种方式不依赖 session/cookie,跨域也安全.
//
// 如果后端未实现此端点,前端 img 加载失败后会降级为"不校验验证码".

export const captchaApi = {
  image: (ticket: string) => `/api/captcha/image?ticket=${encodeURIComponent(ticket)}`,
  check: (payload: import('@/types').CaptchaCheckPayload) =>
    http.post<boolean>('/captcha/check', payload),
};

// ===== 用户 =====

export const userApi = {
  login: (form: LoginWithCaptcha) => http.post<string>('/user/login', form),
  /** 注册不会自动登录,由前端跳登录页. 注册时可携带 captcha(可选). */
  register: (form: RegisterPayload) => http.post<UserProfile>('/user/register', form),
  info: () => http.get<UserProfile>('/user/info'),
  update: (form: { name: string; age: number }) => http.post<void>('/user/update', form),
  /** 修改密码(原项目叫 reset,语义同改密). */
  reset: (form: { oldPassword: string; newPassword: string; confirmPassword: string }) =>
    http.post<void>('/user/reset', form),
  changeAvatar: (id: number, url: string) =>
    http.post<void>('/user/modAvatar', null, { params: { id, url } }),
  wants: () => http.get<number[]>('/movie/wants'),
  /** 想看开关。返回切换后的真实状态: true=现在想看, false=已取消想看。 */
  toggleWant: (id: number) => http.delete<boolean>(`/movie/want/${id}`),
  orders: (status: number) => http.get<OrderInfo[]>(`/user/orders/${status}`),
  refund: (id: number) => http.post<string>(`/user/refund/${id}`),
  /** 取消待支付订单(释放座位、状态置已关闭). 2026-10-19 新增. */
  cancelOrder: (id: number) => http.post<string>(`/user/cancelOrder/${id}`),
  createOrder: (form: CreateOrderForm, key: string = crypto.randomUUID()) =>
    http.post<number>('/user/createOrder', form, { headers: { 'Idempotency-Key': key } }),
  score: (form: ScoreForm) => http.post<boolean>('/user/score', form),
  scoreInfo: (orderId: number) => http.get<ScoreRecord | null>(`/user/score/info/${orderId}`),
};

// ===== 管理员 =====
export const reviewApi = {
  context: (orderId: number) =>
    http.get<import('@/types').ReviewContext>('/user/score/context/' + orderId),
  mine: (page = 1, limit = 10) =>
    http.get<PageResult<import('@/types').ReviewView>>('/user/scores', { params: { page, limit } }),
  movie: (movieId: number, page = 1, sort = 'newest') =>
    http.get<import('@/types').MovieReviewPage>('/movie/' + movieId + '/reviews', {
      params: { page, limit: 10, sort },
    }),
  save: (form: ScoreForm) => userApi.score(form),
  remove: (orderId: number, version: number) =>
    http.delete<void>('/user/score/' + orderId, { params: { version } }),
};

export const adminApi = {
  login: (form: LoginWithCaptcha) => http.post<string>('/admin/login', form),
  info: () => http.get<UserProfile>('/admin/info'),
  update: (name: string, age: number) =>
    http.post<UserProfile>('/admin/update', null, { params: { name, age } }),
  listAdmins: (params: AdminListParams = {}) =>
    http.get<PageResult<Admin>>('/admin/list', { params }),
  addAdmin: (form: { name: string; password: string; age: number }) =>
    http.post<Admin>('/admin/addAdmin', form),
  toggleAdmin: (name: string, status: number) =>
    http.patch<void>('/admin/modStatus', { name, status }),
  deleteAdmin: (id: number) => http.delete<boolean>(`/admin/delete/${id}`),

  userList: (params: UserListParams & PageQuery = {}) =>
    http.get<PageResult<UserProfile>>('/admin/user/list', { params }),
  userAdd: (form: Partial<UserProfile> & { password: string }) =>
    http.post<UserProfile>('/admin/user/add', form),
  userSave: (form: Partial<UserProfile>) => http.post<boolean>('/admin/user/save', form),
  userStatus: (id: number, status: number) =>
    http.put<boolean>('/admin/user/status', { id, status }),
  userDelete: (id: number) => http.delete<boolean>(`/admin/user/delete/${id}`),
};

// ===== 影片 =====

/**
 * 影片只读接口.
 *
 * 资料写入由管理员的更新、补缺和核实补录接口处理。
 */
export const movieApi = {
  hot: () => http.get<Movie[]>('/movie/loadMainPage'),
  /** 影院销售额榜: 真实已支付票款 Top10(投影 VO). */
  topSales: () => http.get<MovieSoldVO[]>('/movie/topSales'),
  /** 公开票房榜: 全国累计票房 Top10(外部公开数据). */
  topBoxOffice: () => http.get<MovieSoldVO[]>('/movie/topBoxOffice'),
  info: (id: number) => http.get<MovieDetail>(`/movie/info/${id}`),
  page: (params: MovieListParams = {}) => http.get<PageResult<Movie>>('/movie/list', { params }),
  /* ===== 2026-10-16 翻新: 卫星资源端点 ===== */
  images: (id: number) => http.get<MovieImage[]>(`/movie/${id}/images`),
  videos: (id: number) => http.get<MovieVideo[]>(`/movie/${id}/videos`),
  crew: (id: number, roleType?: 1 | 2 | 3) =>
    http.get<MovieCrewVO[]>(`/movie/${id}/crew`, { params: roleType ? { roleType } : {} }),
};

/**
 * 影片数据同步 - 管理员专用.
 *
 * 更新和补缺共用任务状态，前端通过 syncStatus 轮询。
 * SYNC 只新增库中没有的大陆待映影片；已有影片不修改。
 */
export const movieAdminApi = {
  overview: () => http.get<import('@/types').MovieSyncOverview>('/admin/movie/sync/overview'),
  startSync: () => http.post<{ started: boolean }>('/admin/movie/sync'),
  startRepair: () => http.post<{ started: boolean }>('/admin/movie/repair'),
  editMetadata: (id: number, payload: import('@/types').MovieMetadataEdit) =>
    http.put<Movie>(`/admin/movie/${id}/metadata`, payload),
  syncStatus: () => http.get<MovieSyncStatus>('/admin/movie/sync/status'),
};

// ===== 影厅 / 座位 =====

export const hallApi = {
  list: () => http.get<Hall[]>('/hall/list'),
  detail: (id: number) => http.get<Hall>(`/hall/${id}`),
  seats: (hallId: number) => http.get<Seat[]>(`/hall/seats/${hallId}`),
  add: (form: HallForm) => http.post<number>('/admin/hall/add', form),
  update: (form: HallForm) => http.post<Hall>('/admin/hall/update', form),
  delete: (id: number) => http.delete<boolean>(`/admin/hall/delete/${id}`),
};

/**
 * 影厅座位图: 草稿 → 发布 的工作流 (Phase 3/4).
 *
 * 语义:
 *  - 一个厅同时最多一个草稿. 拉草稿时如果还没有, 后端会从当前版本复制一份出来.
 *  - 保存草稿要带 `expectedLockVersion`, 不匹配说明别人改过 → 409.
 *  - 发布(apply)时如果该厅还有**未放映场次**会拒绝, 并把场次 id 列出来 ——
 *    管理员得先去排片管理下架, 因为改座位图会让已售的票对不上座位.
 */
export const hallSeatApi = {
  /** 拉草稿(没有则从当前版本复制). */
  draft: (hallId: number) => http.get<SeatDraft>(`/admin/hall/${hallId}/seats/draft`),
  /** 保存草稿. */
  saveDraft: (hallId: number, payload: SeatDraftSavePayload) =>
    http.put<void>(`/admin/hall/${hallId}/seats/draft`, payload),
  /** 丢弃草稿(回退到当前版本). */
  dropDraft: (hallId: number) => http.delete<void>(`/admin/hall/${hallId}/seats/draft`),
  /** 发布草稿. 注意: 200 不代表成功, 要看返回的 `ok`. */
  apply: (hallId: number) => http.post<SeatApplyResult>(`/admin/hall/${hallId}/seats/draft/apply`),
  /** 历史版本(新→旧). */
  versions: (hallId: number) => http.get<HallSeatVersion[]>(`/admin/hall/${hallId}/seats/versions`),
};

// ===== 座位模板 (Phase 1) =====

/**
 * 模板管理: Phase 1 只暴露 CRUD.
 * 模板是草图, 改/删不影响影厅已有座位(那些是 Phase 2+ 的事).
 */
export const seatTemplateApi = {
  list: () => http.get<SeatTemplate[]>('/admin/seat-template'),
  detail: (id: number) => http.get<SeatTemplate>(`/admin/seat-template/${id}`),
  create: (form: {
    name: string;
    description?: string;
    rowsCount: number;
    colsCount: number;
    units?: SeatTemplateUnit[];
  }) => http.post<number>('/admin/seat-template', form),
  /**
   * 整图覆盖: 前端编辑完整个座位图后一次性传过来, 后端 delete+insert.
   * 注意: units 里的 status=0 (过道) 也必须传, 否则后端不知道这一格是过道.
   */
  replaceUnits: (id: number, units: SeatTemplateUnit[]) =>
    http.put<void>(`/admin/seat-template/${id}/units`, { units }),
  delete: (id: number) => http.delete<void>(`/admin/seat-template/${id}`),
};

// ===== 排片 =====

export const scheduleApi = {
  /** 公共端点,用户门户使用(permitAll). */
  publicByHall: (hallId: number, movieId?: number) =>
    http.get<Schedule[]>(`/schedule/byHall/${hallId}`, { params: { movieId } }),
  /**
   * 选座页数据: 座位图(取自本场次锁定的版本) + 每座的票状态.
   * 座位的 `ticketId` 就是下单要传的 id.
   */
  seats: (id: number) => http.get<ScheduleSeats>(`/schedule/${id}/seats`),
  /** 管理端分页. status: 不传=全部, 1=正常, 2=已取消. */
  adminPage: (params: ScheduleAdminParams) =>
    http.get<PageResult<Schedule>>('/admin/schedule/list', { params }),
  add: (form: ScheduleAddForm) => http.post<number>('/admin/schedule/add', form),
  /** 批量排片: 冲突/不合法的行跳过并报告原因, 其余入库. */
  batchAdd: (form: ScheduleBatchAddForm) =>
    http.post<ScheduleBatchResult>('/admin/schedule/batchAdd', form),
  /** 批量改期: 同批次同时段整体改时刻. */
  batchMove: (form: ScheduleBatchMoveForm) =>
    http.post<ScheduleBatchResult>('/admin/schedule/batchMove', form),
  /** 批次同时段规模(total/movable). */
  batchInfo: (batchId: string, time: string) =>
    http.get<ScheduleBatchInfo>(`/admin/schedule/batchInfo/${batchId}`, { params: { time } }),
  /** 更新. body 不能带 hallId/price/倍率(见 ScheduleUpdateForm). */
  update: (form: ScheduleUpdateForm) => http.post<boolean>('/admin/schedule/update', form),
  /** 取消场次: 停止售票并自动全额退款. 返回受影响订单数. */
  cancel: (id: number) => http.post<number>(`/admin/schedule/cancel/${id}`),
  delete: (id: number) => http.delete<boolean>(`/admin/schedule/delete/${id}`),
};

// ===== 订单 / 票 =====

export const orderApi = {
  detail: (id: number) => http.get<OrderInfo>(`/order/${id}`),
  pay: (orderId: number, channel: PayChannel) =>
    http.post<OrderInfo>('/order/pay', { orderId, channel }),
  countByStatus: () => http.get<Record<string, number>>('/order/countByStatus'),
  /** 管理端分页. */
  adminPage: (params: OrderAdminParams) =>
    http.get<PageResult<OrderInfo>>('/admin/order/list', { params }),
};

// ===== 营收 / 统计 =====

export const statApi = {
  overview: () => http.get<import('@/types').OverviewStat>('/statistic/getAll'),
  revenue: (params: {
    startDate: string;
    endDate: string;
    granularity: 'day' | 'week' | 'month';
  }) => http.get<import('@/types').RevenueReport>('/statistic/revenue', { params }),
};

// ===== AI 客服 =====
//
// 流式对话不在这: 见 http.ts 的 streamFetch(POST /ai/chat, SSE).
// 这里是会话管理三件套 —— 按 chatId 的读写后端都做归属校验.

export const aiApi = {
  stop: (chatId: string) => http.post<boolean>('/ai/stop/' + encodeURIComponent(chatId)),
  actions: (chatId: string) =>
    http.get<import('@/types').AiAction[]>('/ai/actions/' + encodeURIComponent(chatId)),
  confirm: (id: string) =>
    http.post<import('@/types').AiAction>('/ai/action/' + encodeURIComponent(id) + '/confirm'),
  dismiss: (id: string) =>
    http.post<import('@/types').AiAction>('/ai/action/' + encodeURIComponent(id) + '/dismiss'),
  /** 用户全部会话, 最近活动在前. 标题/时间是后端落库的真值. */
  sessions: () => http.get<AiSession[]>('/ai/sessions'),
  /** 会话历史({role, content, ts}[]). 会话不存在返回空表, 他人会话 → 403. */
  history: (chatId: string) => http.get<import('@/types').AiMessage[]>(`/ai/history/${chatId}`),
  /** 删除会话及其全部消息. */
  deleteSession: (chatId: string) => http.delete<boolean>(`/ai/session/${chatId}`),
};

// ===== 文件 =====

export const fileApi = {
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return http.post<string>('/file/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
