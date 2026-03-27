import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Указываем полный путь к сайту для canonical ссылок
  site: 'https://mnuryyev.github.io',
  // Базовая папка на GitHub Pages
  base: '/handson/',
  // Автоматическая генерация карты сайта для Google
  integrations: [
    sitemap() 
  ],
  trailingSlash: 'always' 
});
