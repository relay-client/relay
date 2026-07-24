/// <reference types="svelte" />
/// <reference types="vite/client" />

// Provided by the relay-changelog plugin in vite.config.ts: the repo's
// CHANGELOG.md, inlined at build time for the "What's new" screen.
declare module 'virtual:relay-changelog' {
  const markdown: string;
  export default markdown;
}
