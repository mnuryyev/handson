import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap'; // 1. Добавили импорт плагина

export default defineConfig({
  site: 'https://mnuryyev.github.io',
  base: '/handson/',
  integrations: [
    sitemap() // 2. Включили генерацию карты сайта
  ],
});
