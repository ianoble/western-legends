import { createRouter, createWebHistory } from 'vue-router';
import LobbyView from './views/LobbyView.vue';
import JoinView from './views/JoinView.vue';
import GameView from './views/GameView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LobbyView },
    { path: '/join/:matchID', component: JoinView, props: true },
    { path: '/game/:matchID/:playerID', component: GameView, props: true },
  ],
});
