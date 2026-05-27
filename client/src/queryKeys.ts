export const queryKeys = {
  collections: ['collections'] as const,
  videos: (params: unknown) => ['videos', params] as const,
  settings: ['settings'] as const,
}
