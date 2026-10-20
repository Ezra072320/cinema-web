/**
 * 影片展示层的公共格式化函数.
 *
 * 后端 `movie` 表的字段很多是可空的（老的手工录入数据、猫眼快照、豆瓣快照
 * 字段覆盖度都不一样），每个页面各写一遍 `??` 兜底很容易漏。
 * 这里集中处理"字段缺失时该显示什么"，含 0 / null / 空串的判定。
 *
 * 约定：所有函数在无数据可显示时返回空串，模板里直接 `v-if` 即可。
 */

import type { Movie, MovieDetail } from '@/types';

/** 时长（分钟）。0 = 待映影片尚未公布时长，此时返回 null（显示"待公布"而非"0 分钟"）。 */
export function runtimeOf(m: Pick<Movie, 'runtimeMin'>): number | null {
  const r = m.runtimeMin;
  return typeof r === 'number' && r > 0 ? r : null;
}

/** "125 分钟"，未公布时返回空串。 */
export function runtimeText(m: Pick<Movie, 'runtimeMin'>): string {
  const r = runtimeOf(m);
  return r ? `${r} 分钟` : '';
}

/**
 * 累计票房。后端存的是元，展示时按国人习惯转成 亿 / 万。
 * 0 或缺失返回空串（避免首页出现一堆 "0"）。
 */
export function boxOfficeOf(m: Pick<Movie, 'totalBox'>): string {
  const box = Number(m.totalBox ?? 0);
  if (!box || box <= 0) return '';
  if (box >= 1e8) return `${(box / 1e8).toFixed(2)} 亿`;
  if (box >= 1e4) return `${(box / 1e4).toFixed(0)} 万`;
  return `${box} 元`;
}

/** 豆瓣/猫眼评分。0 表示暂无评分。 */
export function ratingOf(m: Pick<Movie, 'score'>): number | null {
  const s = Number(m.score ?? 0);
  return s > 0 ? s : null;
}

/** "7.9"，无评分返回空串。 */
export function ratingText(m: Pick<Movie, 'score'>): string {
  const s = ratingOf(m);
  return s ? s.toFixed(1) : '';
}

/** 上映年份，从 releaseDate 里取。 */
export function yearOf(m: Pick<Movie, 'releaseDate'>): string {
  const d = m.releaseDate;
  return d && d.length >= 4 ? d.slice(0, 4) : '';
}

/** 类型标签。typeNames（后端展开表）优先，退化到 cat（原始 csv）。 */
export function genresOf(m: Pick<Movie, 'typeNames' | 'cat'>, limit = 3): string[] {
  const fromNames = m.typeNames?.length ? m.typeNames : null;
  const raw = fromNames ?? (m.cat ? m.cat.split(',') : []);
  return raw
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/** 海报地址。 */
export function posterOf(m: Pick<Movie, 'posterUrl'>): string {
  return m.posterUrl || '';
}

/** 详情页头图。没有剧照时退化用海报（CSS 会做模糊填充）。 */
export function backdropOf(m: Pick<MovieDetail, 'backdropUrl' | 'posterUrl'>): string {
  return m.backdropUrl || m.posterUrl || '';
}

/** 状态数字（0 经典 / 1 热映 / 2 即将上映）。兼容后端可能返回的字符串枚举。 */
export function statusOf(m: Pick<Movie, 'status'>): 0 | 1 | 2 {
  const s = m.status;
  if (typeof s === 'number') return (s === 0 || s === 1 || s === 2 ? s : 1) as 0 | 1 | 2;
  switch (String(s).toUpperCase()) {
    case 'CLASSIC':
      return 0;
    case 'SOON':
      return 2;
    default:
      return 1;
  }
}

/** 状态中文名。 */
export function statusText(m: Pick<Movie, 'status' | 'hasSchedules'>): string {
  return m.hasSchedules === true ? '本店热映' : '暂未排片';
}

export function marketStatusText(m: Pick<Movie, 'marketStatus'>): string {
  return ['已上映 / 片库', '大陆上映中', '大陆待上映'][m.marketStatus ?? 0] ?? '资料待确认';
}

export function ratingSourceText(source?: string): string {
  return source === 'MAOYAN' ? '猫眼评分' : source === 'DOUBAN' ? '豆瓣评分' : source === 'TMDB' ? 'TMDB 评分' : '评分';
}

/** 数据来源声明文案。 */
export function sourceText(src?: string): string {
  switch ((src ?? '').toUpperCase()) {
    case 'DOUBAN':
      return '本数据来源于豆瓣电影';
    case 'MAOYAN':
      return '本数据来源于猫眼电影';
    case 'TMDB':
      return '本数据来源于 TMDB';
    default:
      return '';
  }
}
