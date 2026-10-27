import { http } from './http';
import type { Movie } from '@/types';

export interface MovieSearchHit {
  movie: Movie;
  highlights: Record<string, string[]>;
  hasSchedules?: boolean;
  scheduleCount?: number;
  nextShowTime?: string;
}
export interface MovieSearchResult {
  total: number;
  rows: MovieSearchHit[];
  mode: 'FULLTEXT' | 'BASIC';
}
export interface MovieSearchParams {
  q?: string;
  genre?: string;
  area?: string;
  showing?: boolean;
  page: number;
  size: number;
  sort: string;
}
export const searchApi = {
  movies: (params: MovieSearchParams) =>
    http.get<MovieSearchResult>('/search/movies', { params, quiet: true }),
  status: () => http.get<Record<string, unknown>>('/admin/search/status', { quiet: true }),
  rebuild: () => http.post<{ started: boolean }>('/admin/search/rebuild'),
};
