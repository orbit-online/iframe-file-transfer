import { createSenderListener } from '../../../src/vanilla/sender.js';

window.addEventListener('DOMContentLoaded', createSenderListener(), { passive: true });
