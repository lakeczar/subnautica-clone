import './style.css';
import './ui/panels.css';
import './ui/hud.css';
import { SiltwakeApp } from './runtime/app.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Siltwake root is missing.');
const app = new SiltwakeApp(root);
if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
