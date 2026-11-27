import { render } from 'preact';
import { initAuth } from './lib/auth';
import { App } from './App';
import './styles.css';

// Must run before anything reads location.hash: it picks up a full-page sign-in result.
initAuth();
render(<App />, document.getElementById('app')!);
