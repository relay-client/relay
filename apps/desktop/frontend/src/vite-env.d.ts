/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module 'virtual:relay-changelog' {
  const markdown: string;
  export default markdown;
}

declare module 'virtual:relay-changelog-meta' {
  export const hasReleaseNotes: boolean;
}
