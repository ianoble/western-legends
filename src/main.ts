import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { registerGame } from '@engine/client';
import App from './App.vue';
import { router } from './router';
import { gameDef } from './logic/index';
import '@engine/styles/core.css';
import './style.css';

registerGame(gameDef);

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
