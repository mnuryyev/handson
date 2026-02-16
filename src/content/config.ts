import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const labs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/labs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string().optional(),
    date: z.string().optional(),
  }),
});

// Пока коллекции статей и проектов пустые, просто объявим их так же
const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
  schema: z.object({ title: z.string() }),
});

export const collections = { labs, articles };