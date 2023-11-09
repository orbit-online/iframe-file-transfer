import { initializeSender } from '../../../src/vanilla/sender.js';

const IFRAME_URL = 'http://localhost:3001/examples/vanilla/iframe.html';

window.addEventListener('DOMContentLoaded', initializeSender(IFRAME_URL), { passive: true });
