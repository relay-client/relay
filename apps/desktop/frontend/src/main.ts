import './lib/theme';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { installFatalErrorGuard } from './lib/fatalError';

installFatalErrorGuard();

const target = document.getElementById('app') as HTMLElement;

const app = mount(App, {
  target
});

export default app;
