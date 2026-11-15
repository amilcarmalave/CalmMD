import { render } from 'solid-js/web';
import '@fontsource-variable/inter';
import '@fontsource-variable/literata';
import '@fontsource-variable/jetbrains-mono';
import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/preview.css';
import './styles/editor.css';
import './styles/commands.css';
import App from './App';
import { getPlatform } from './platform';
import { DrawingWindow } from './ui/DrawingWindow';

const platform = getPlatform();
// A drawing window (desktop) shows just that drawing; every other window is the editor.
const drawing = platform.initialDrawing?.() ?? null;
render(
  () => (drawing ? <DrawingWindow platform={platform} path={drawing} /> : <App platform={platform} />),
  document.getElementById('root')!,
);
