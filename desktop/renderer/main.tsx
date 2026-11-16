import { render } from 'preact';
import { Panel } from './panel';
import { Pet } from './pet';
import { Setup } from './setup';
import './styles.css';
import './setup.css';

// One bundle, three windows: the floating panel, the settings / first-run window (loaded with #setup),
// and Dash on the desktop (loaded with #pet).
const view = location.hash === '#setup' ? 'setup' : location.hash === '#pet' ? 'pet' : 'panel';
document.documentElement.dataset.view = view;
render(view === 'setup' ? <Setup /> : view === 'pet' ? <Pet /> : <Panel />, document.getElementById('app')!);
