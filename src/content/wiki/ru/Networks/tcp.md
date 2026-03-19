---
title: "Обзор функционала Wiki"
description: "Тестовая страница для проверки медиа-контента на русском"
---

## 1. Проверка изображений
Вот так выглядит изображение из твоего пути. Мы используем стандартный синтаксис Markdown.

![Превью коридора](/handson/images/corridor_thm/01_intro.png)

> **Примечание:** Убедись, что папка `images` лежит внутри `public/handson/`, тогда пути будут подхватываться корректно.

---

## 2. Полезные ссылки
Здесь мы проверяем, как работают внешние ресурсы. По правилам хорошего тона, внешние ссылки должны открываться в новой вкладке.

* [Официальный сайт Astro](https://astro.build) — Фреймворк, на котором собран этот сайт.
* [Документация Obsidian](https://help.obsidian.md) — Идейный вдохновитель нашего дизайна.

---

## 3. Видео (YouTube)
Чтобы видео выглядело круто и его можно было смотреть прямо здесь, мы используем `iframe`. Это стандартный способ вставить плеер.

<div class="video-container">
  <iframe 
    src="https://www.youtube.com/embed/dQw4w9WgXcQ" 
    title="YouTube video player" 
    frameborder="0" 
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
    referrerpolicy="strict-origin-when-cross-origin" 
    allowfullscreen>
  </iframe>
</div>

---

## 4. Списки и задачи
В стиле Obsidian удобно вести чек-листы:
- [x] Настроить дерево файлов
- [x] Выставить размер шрифта 13.5px
- [ ] Добавить поиск по статьям
