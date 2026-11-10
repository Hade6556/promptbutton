import { render } from 'preact';
import { Panel } from './panel';
import { Setup } from './setup';
import './styles.css';
import './setup.css';

// One bundle, two windows: the floating panel, and the settings / first-run window (loaded with #setup).
const isSetup = location.hash === '#setup';
document.documentElement.dataset.view = isSetup ? 'setup' : 'panel';
render(isSetup ? <Setup /> : <Panel />, document.getElementById('app')!);
