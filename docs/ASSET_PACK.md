# ASSET_PACK.md: что подготовить заранее (v1)

**Цель:** 3 хука × 2 тела × 2 CTA = **12 готовых роликов** автомонтажом в Remotion (минимум по ТЗ: 10).
**Принцип честности:** ассеты сгенерированы заранее в твоих AI-инструментах. В UI и README они подписаны «pre-generated offline», а инструмент и промпт берутся из `pack.csv`. Автоматизация, которую мы показываем, это монтаж. Именно это и описано в вакансии: «templates that turn scripts, UGC footage, and AI assets into hundreds of short videos».

## 0. Решения по умолчанию (меняй, если хочешь)

| Параметр | Значение | Почему |
|---|---|---|
| Продукт | Вымышленный бренд **NORDA**: матово-чёрная стальная термобутылка | Лёд, конденсат и капли хорошо выходят у Kling; один предмет легко держать одинаковым через image-to-video |
| Язык | EN | Ryze англоязычный |
| Голос | Один голос на все 7 реплик | Иначе варианты звучат как разные бренды |
| Формат | 9:16 | Основной; 1:1 и 4:5 движок делает сам (stretch) |

## 1. Дерево (ровно так, имена важны)

```
ryze-asset-pack/
├─ pack.csv                 # provenance: файл, инструмент, модель, промпт, текст (шаблон: pack_template.csv)
├─ brand/
│  ├─ packshot.png          # ОБЯЗАТЕЛЬНО. Продукт на прозрачном фоне, ≥1500×1500
│  └─ logo.png              # опционально. Если нет, бренд рисуется шрифтом
├─ hooks/   H1.mp4  H1.mp3   H2.mp4  H2.mp3   H3.mp4  H3.mp3
├─ bodies/  B1a.mp4 B1b.mp4 B1.mp3   B2a.mp4 B2b.mp4 B2.mp3
├─ ctas/    C1.mp3  C2.mp3   (опц.) C.mp4    # вращающийся packshot для финала
├─ music/   M1.mp3  M2.mp3
└─ sfx/     whoosh.wav  pop.wav              # опционально, из твоей библиотеки
```

**Итого обязательных файлов: 18.** Это 7 видео + 7 голосов + `packshot.png` + 2 трека + `pack.csv`. Опциональных 4: `logo.png`, `C.mp4`, 2 SFX.

## 2. Технические требования

| Тип | Формат | Длина / размер | Критично |
|---|---|---|---|
| Видео | MP4 H.264, **9:16**, ≥720×1280, 24–30 fps | **5 с**, ≤15 МБ | Без текста в кадре. Звук будет вырезан. Watermark free-тарифа Kling/Higgsfield мой зум 1.08 не гарантированно обрежет, поэтому бери чистые, если есть возможность |
| Голос | MP3/WAV 44.1/48 kHz, моно/стерео | 1 файл = 1 реплика, тишина в начале ≤0.3 с | **Текст дословно как в §3**, иначе тайминги слов разъедутся |
| Тайминги слов | опц. `H1.words.json` или `H1.srt` рядом с голосом | — | Если нет, считаю сам по паузам в аудио: точность ниже, но для 5–15 слов на фразу приемлемо |
| Музыка | MP3, инструментал, без вокала | 25–40 с | Два трека разной энергии |
| Packshot | PNG с альфа-каналом | ≥1500 px | Фон убрать (remove bg) |
| SFX | WAV | ≤1.5 с | — |

Громкость и нормализацию (−16 LUFS, обрезка тишины) я делаю сам при импорте. Тебе как звукорежиссёру можно не возиться.

## 3. Тексты озвучки (читать дословно)

Бренд вымышленный, все утверждения демо-копирайт. В README это будет помечено.

| ID | Роль | Текст VO | On-screen (хук) | ~с |
|---|---|---|---|---|
| H1 | Question hook | Why is your water always warm by noon? | WARM WATER BY NOON? | 3.0 |
| H2 | Demo hook | Yesterday's ice. Still in here. | YESTERDAY'S ICE. STILL HERE. | 2.2 |
| H3 | UGC hook | I stopped buying bottled water. Here's why. | I QUIT BOTTLED WATER | 2.8 |
| B1 | Proof | Double steel walls keep drinks ice cold for twenty-four hours. Car, gym, beach. Still cold. | — | 6.0 |
| B2 | Durability | Leak-proof lid. Fits every cup holder. Survives the drops. Built for real days. | — | 5.0 |
| C1 | CTA | Get yours. Link in bio. | — | 1.8 |
| C2 | CTA | Thirty-day trial. Tap the link. | — | 2.0 |

Длина одного ролика: **~10–12 с**. Лимиты слотов, которые проверяет preflight: хук ≤4.0 с, тело ≤9.0 с, CTA ≤3.5 с.

## 4. Промпты (копировать как есть)

**Порядок важен для консистентности:** сначала packshot, потом все клипы с продуктом делай **image-to-video от packshot** с одинаковым «световым языком».

| Файл | Инструмент | Промпт (EN) |
|---|---|---|
| packshot.png | NanoBanana Pro | Studio product photo of a matte black stainless steel insulated water bottle with a brushed steel cap, minimalist, no text or logo on the bottle, soft top light, subtle reflections, centered, plain light grey background, 4k → затем remove background |
| H1.mp4 | Kling / Higgsfield (t2v, без packshot) | Vertical 9:16 handheld UGC phone footage inside a hot car at noon, a hand picks up a flimsy plastic water bottle from the dashboard, harsh sunlight, visible heat haze, slight camera shake |
| H2.mp4 | i2v от packshot | Macro close-up, a hand unscrews the brushed steel cap of the matte black bottle, ice cubes visible inside, cold vapor rising, dark studio, slow motion |
| H3.mp4 | i2v от packshot | Vertical selfie-style UGC, a young woman in a bright kitchen holds the matte black bottle up to the camera and smiles, natural window light, handheld |
| B1a.mp4 | i2v | The matte black bottle in a car cup holder, sunlight through the windshield, condensation droplets on the steel, slow push-in |
| B1b.mp4 | i2v | Gym, a hand lifts the matte black bottle from a bench and drinks, shallow depth of field, cinematic light |
| B2a.mp4 | i2v | Slow motion, the matte black bottle falls onto concrete and bounces, cap stays sealed, low angle, dramatic light |
| B2b.mp4 | i2v | Golden hour hiking trail, a hand slides the matte black bottle into a backpack side pocket, handheld, warm light |
| C.mp4 (опц.) | i2v | The matte black bottle rotating slowly on a black pedestal, rim light, seamless studio background |
| H*/B*/C*.mp3 | ElevenLabs или любой TTS | Тексты из §3; один голос; energetic conversational; stability ~0.4 |
| M1.mp3 | Suno | instrumental, upbeat minimal hip-hop beat, 100 bpm, punchy kick, no vocals, 30 seconds |
| M2.mp3 | Suno | instrumental, bright electro-pop, 120 bpm, energetic, no vocals, 30 seconds |

Опция для H3: если сделаешь говорящего UGC-аватара с lip-sync под голос H3, положи видео со звуком как `H3.mp4`, а `H3.mp3` = та же дорожка. Движок возьмёт голос из mp3, а видео останется синхронным.

**Лицензии [ASSUMPTION, проверь свои тарифы]:** у бесплатных планов ElevenLabs и Suno некоммерческое использование. Для тестового задания это нормально, в README укажу честно.

## 5. pack.csv (шаблон: `pack_template.csv`)

Колонки: `file,slot,kind,tool,model,prompt,text,onScreen,created`. Промпты и тексты в шаблоне уже заполнены. Тебе остаётся `tool`, `model` (что реально использовал) и `created` (дата). Эти данные становятся панелью «AI Assets» в демо и разделом Provenance в README.

## 6. Чек-лист перед отправкой

- [ ] 7 видео: 9:16, ~5 с, без текста в кадре
- [ ] 7 голосов, текст дословно по §3, один голос
- [ ] packshot.png с прозрачным фоном
- [ ] 2 трека музыки без вокала
- [ ] pack.csv заполнен
- [ ] Всё в `ryze-asset-pack.zip` (или папка `ryze-asset-pack/`) → положи в `inbox/` репозитория. Claude Code подхватит его в начале P2, P5 или P6 (`inbox/` в .gitignore, в публичный репо не попадает).

## 7. Что делаю я, пока ты генерируешь

Строю движок против синтетического набора с **точно таким же деревом** (ffmpeg: тестовые клипы 9:16 и «голос» из тональных слов с паузами). Когда придёт твой архив, он встанет без изменений кода: `npm run ingest -- inbox/ryze-asset-pack.zip`.
