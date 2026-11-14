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

render(() => <App platform={getPlatform()} />, document.getElementById('root')!);
