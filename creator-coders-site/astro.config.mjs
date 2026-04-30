import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://creatorcoders.com',
  integrations: [sitemap()],
});
