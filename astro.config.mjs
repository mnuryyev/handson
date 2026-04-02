import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // site указываем без подпапок
  site: 'https://mnuryyev.github.io',
  // base указывает на подпапку репозитория
  base: '/handson', 
  // Интеграции
  integrations: [sitemap()],
  // Строго заставляем Astro всегда добавлять слэш в конце URL
  trailingSlash: 'always',
  // Это поможет sitemap генерировать правильные ссылки
  build: {
    format: 'directory'
  }
});
