import { render } from 'preact';
import './input.css';
import { App } from './views/app';

const root = document.getElementById('app');
if (root) {
	render(<App />, root);
}
