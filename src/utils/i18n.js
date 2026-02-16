export const ui = {
  ru: {
    'nav.labs': 'Лабораторные',
    'nav.articles': 'Статьи',
    'nav.projects': 'Проекты',
    'hero.title': 'Твой учебный процесс',
    'hero.desc': 'Документация, лабораторные работы и разборы проектов.',
    'plural.part': ['часть', 'части', 'частей']
  },
  en: {
    'nav.labs': 'Labs',
    'nav.articles': 'Articles',
    'nav.projects': 'Projects',
    'hero.title': 'Your Learning Process',
    'hero.desc': 'Documentation, labs, and step-by-step project breakdowns.',
    'plural.part': ['part', 'parts', 'parts']
  }
};

// Универсальная функция склонения для обоих языков
export function pluralize(count, lang, type) {
  const forms = ui[lang][type];
  if (lang === 'en') {
    return count === 1 ? forms[0] : forms[1];
  }
  // Русская логика (твоя текущая)
  let n = Math.abs(count) % 100;
  let n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}