/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module 'virtual:kurlo-changelog' {
  const markdown: string;
  export default markdown;
}

declare module 'virtual:kurlo-changelog-meta' {
  export const hasReleaseNotes: boolean;
}
