import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const labs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/labs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string().optional(),
    date: z.string().optional(),
    tags: z.array(z.string()).default([]), // <-- ДОБАВИЛИ ТЕГИ
  }),
});

const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
  schema: z.object({ 
    title: z.string(),
    tags: z.array(z.string()).default([]), // <-- ДОБАВИЛИ ТЕГИ
  }),
});

const wiki = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/wiki" }),
  schema: z.object({ 
    title: z.string(),
    description: z.string().optional(),
    date: z.string().optional(),
    tags: z.array(z.string()).default([]), // <-- ДОБАВИЛИ ТЕГИ
  }),
});

export const collections = { labs, articles, wiki };
